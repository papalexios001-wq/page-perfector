import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Logger,
  withRetry,
  corsHeaders,
  AppError,
  createErrorResponse,
  validateRequired,
  checkRateLimit,
} from "../_shared/utils.ts";

type AIProvider = 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

interface AdvancedSettings {
  targetScore: number;
  minWordCount: number;
  maxWordCount: number;
  enableFaqs: boolean;
  enableSchema: boolean;
  enableInternalLinks: boolean;
  enableToc: boolean;
  enableKeyTakeaways: boolean;
  enableCtas: boolean;
}

interface SiteContext {
  organizationName?: string;
  authorName?: string;
  industry?: string;
  targetAudience?: string;
  brandVoice?: string;
}

interface NeuronWriterConfig {
  enabled: boolean;
  apiKey: string;
  projectId: string;
  projectName?: string;
}

interface NeuronWriterRecommendations {
  success: boolean;
  status: string;
  queryId?: string;
  targetWordCount?: number;
  readabilityTarget?: number;
  titleTerms?: string;
  h1Terms?: string;
  h2Terms?: string;
  contentTerms?: string;
  extendedTerms?: string;
  entities?: string;
  termsDetailed?: {
    title: Array<{ t: string; usage_pc: number }>;
    content: Array<{ t: string; usage_pc: number; sugg_usage?: [number, number] }>;
    entities: Array<{ t: string; importance: number; relevance: number; confidence: number }>;
  };
  questions?: {
    suggested: string[];
    peopleAlsoAsk: string[];
    contentQuestions: string[];
  };
  competitors?: Array<{
    rank: number;
    url: string;
    title: string;
    score?: number;
  }>;
}

interface InternalLinkCandidate {
  url: string;
  slug: string;
  title: string;
}

interface OptimizeRequest {
  pageId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  targetKeyword?: string;
  language?: string;
  region?: string;
  aiConfig?: AIConfig;
  neuronWriter?: NeuronWriterConfig;
  advanced?: AdvancedSettings;
  siteContext?: SiteContext;
}

// Helper: Update job progress in database
async function updateJobProgress(
  supabase: any,
  jobId: string,
  step: string,
  progress: number,
  logger: Logger
) {
  try {
    await supabase.from('jobs').update({ 
      current_step: step, 
      progress,
      status: 'running',
    }).eq('id', jobId);
    logger.info(`Job progress: ${step} (${progress}%)`);
  } catch (e) {
    logger.warn('Failed to update job progress', { error: e instanceof Error ? e.message : 'Unknown' });
  }
}

// Helper: Mark job and page as failed
async function markJobFailed(
  supabase: any,
  jobId: string,
  pageId: string,
  errorMessage: string,
  logger: Logger
) {
  try {
    await supabase.from('jobs').update({ 
      status: 'failed', 
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
    
    await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
    
    await supabase.from('activity_log').insert({
      page_id: pageId,
      job_id: jobId,
      type: 'error',
      message: `Failed: ${errorMessage}`,
      details: { requestId: logger.getRequestId() },
    });
    
    logger.error('Job marked as failed', { jobId, pageId, errorMessage });
  } catch (e) {
    logger.error('Failed to mark job as failed', { error: e instanceof Error ? e.message : 'Unknown' });
  }
}

// Helper: Derive keyword from title/slug
function deriveKeyword(title: string, slug: string): string {
  let keyword = title
    .replace(/\s*[-|–—]\s*.*$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  if (keyword.length < 10 && slug) {
    keyword = slug
      .replace(/-/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }
  
  return keyword.substring(0, 100);
}

// Helper: Fetch NeuronWriter recommendations
async function fetchNeuronWriterRecommendations(
  supabaseUrl: string,
  supabaseKey: string,
  neuronWriter: NeuronWriterConfig,
  keyword: string,
  language: string,
  logger: Logger,
  jobId: string,
  supabase: any
): Promise<NeuronWriterRecommendations | null> {
  const maxAttempts = 12;
  const pollInterval = 10000;
  
  logger.info('Creating NeuronWriter query', { keyword, projectId: neuronWriter.projectId });
  
  const createResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'get-recommendations',
      apiKey: neuronWriter.apiKey,
      projectId: neuronWriter.projectId,
      keyword: keyword,
      language: language || 'English',
    }),
  });
  
  if (!createResponse.ok) {
    logger.warn('NeuronWriter initial request failed', { status: createResponse.status });
    return null;
  }
  
  let data = await createResponse.json();
  
  if (data.status === 'ready') {
    logger.info('NeuronWriter data ready immediately');
    return data;
  }
  
  if (!data.queryId) {
    logger.warn('NeuronWriter did not return queryId');
    return null;
  }
  
  const queryId = data.queryId;
  logger.info('NeuronWriter query created, polling...', { queryId });
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    await updateJobProgress(supabase, jobId, 'waiting_neuronwriter', 30 + attempt, logger);
    
    const pollResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'get-recommendations',
        apiKey: neuronWriter.apiKey,
        projectId: neuronWriter.projectId,
        queryId: queryId,
      }),
    });
    
    if (pollResponse.ok) {
      data = await pollResponse.json();
      if (data.status === 'ready') {
        logger.info('NeuronWriter data ready after polling', { attempt });
        return data;
      }
    }
    
    logger.info('NeuronWriter still processing', { attempt, status: data.status });
  }
  
  logger.warn('NeuronWriter timed out after max attempts');
  return null;
}

// Build optimization prompt
function buildOptimizationPrompt(
  pageTitle: string,
  pageContent: string,
  keyword: string,
  internalLinkCandidates: InternalLinkCandidate[],
  neuronWriterData: NeuronWriterRecommendations | null,
  advanced: AdvancedSettings,
  siteContext: SiteContext | undefined
): string {
  const neuronWriterSection = neuronWriterData?.status === 'ready' ? `
═══════════════════════════════════════════════════════════════
🧠 NEURONWRITER SEO INTELLIGENCE (USE THIS DATA!)
═══════════════════════════════════════════════════════════════

📊 TARGET METRICS:
- Recommended Word Count: ${neuronWriterData.targetWordCount || 'N/A'}
- Readability Target: ${neuronWriterData.readabilityTarget || 'N/A'}

📝 TITLE TERMS (include in title):
${neuronWriterData.titleTerms || 'No specific terms'}

📌 H1 TERMS (include in H1):
${neuronWriterData.h1Terms || 'No specific terms'}

📎 H2 TERMS (use in subheadings):
${neuronWriterData.h2Terms || 'No specific terms'}

📄 CONTENT TERMS (use throughout content):
${neuronWriterData.contentTerms || 'No specific terms'}

🔬 EXTENDED TERMS (LSI keywords):
${neuronWriterData.extendedTerms || 'No specific terms'}

🏢 ENTITIES (mention these):
${neuronWriterData.entities || 'No specific entities'}

❓ QUESTIONS TO ANSWER:
${neuronWriterData.questions?.suggested?.slice(0, 5).join('\n') || 'No specific questions'}

🔍 TOP COMPETITORS:
${neuronWriterData.competitors?.slice(0, 3).map(c => `- #${c.rank}: ${c.title}`).join('\n') || 'No competitor data'}
` : '';

  const internalLinksSection = advanced.enableInternalLinks && internalLinkCandidates.length > 0 ? `
═══════════════════════════════════════════════════════════════
🔗 AVAILABLE INTERNAL LINKS (ONLY use these URLs!)
═══════════════════════════════════════════════════════════════
${internalLinkCandidates.slice(0, 50).map(l => `- "${l.title}" → ${l.url}`).join('\n')}

⚠️ CRITICAL: Only link to URLs from this list! Do NOT invent URLs.
` : '';

  const siteContextSection = siteContext ? `
═══════════════════════════════════════════════════════════════
🏢 SITE CONTEXT
═══════════════════════════════════════════════════════════════
- Organization: ${siteContext.organizationName || 'N/A'}
- Industry: ${siteContext.industry || 'N/A'}
- Target Audience: ${siteContext.targetAudience || 'N/A'}
- Brand Voice: ${siteContext.brandVoice || 'professional'}
` : '';

  return `You are an expert SEO content optimizer. Analyze and rewrite the following content.

═══════════════════════════════════════════════════════════════
📄 ORIGINAL PAGE
═══════════════════════════════════════════════════════════════
Title: ${pageTitle}
Primary Keyword: ${keyword}

CURRENT CONTENT:
${pageContent.substring(0, 15000)}

${neuronWriterSection}
${internalLinksSection}
${siteContextSection}

═══════════════════════════════════════════════════════════════
📋 REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Word count: ${advanced.minWordCount}-${advanced.maxWordCount} words
- Target quality score: ${advanced.targetScore}/100
- Include FAQs: ${advanced.enableFaqs ? 'Yes (5-7 FAQs)' : 'No'}
- Include Schema: ${advanced.enableSchema ? 'Yes (Article + FAQ schema)' : 'No'}
- Include Internal Links: ${advanced.enableInternalLinks ? 'Yes (8-12 contextual links)' : 'No'}
- Include Table of Contents: ${advanced.enableToc ? 'Yes' : 'No'}
- Include Key Takeaways: ${advanced.enableKeyTakeaways ? 'Yes (bullet summary)' : 'No'}
- Include CTAs: ${advanced.enableCtas ? 'Yes (2-3 strategic CTAs)' : 'No'}

═══════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (JSON)
═══════════════════════════════════════════════════════════════
Return ONLY valid JSON with this structure:
{
  "optimizedTitle": "SEO-optimized title under 60 chars",
  "metaDescription": "Compelling meta description 150-160 chars",
  "h1": "Main H1 heading",
  "h2s": ["H2 subheading 1", "H2 subheading 2", ...],
  "optimizedContent": "<article>Full HTML content with proper heading hierarchy, paragraphs, lists, internal links, FAQs, etc.</article>",
  "contentStrategy": {
    "wordCount": 2500,
    "readabilityScore": 75,
    "keywordDensity": 1.5,
    "lsiKeywords": ["related", "terms", "used"]
  },
  "internalLinks": [
    {"anchor": "anchor text", "target": "https://...", "position": 1}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "Article",
    ...
  },
  "aiSuggestions": {
    "contentGaps": "Areas that could be expanded",
    "quickWins": "Easy improvements made",
    "improvements": ["improvement 1", "improvement 2"]
  },
  "qualityScore": 85,
  "estimatedRankPosition": 5,
  "confidenceLevel": 0.8,
  "tableOfContents": ["Section 1", "Section 2"],
  "faqs": [{"question": "...", "answer": "..."}],
  "keyTakeaways": ["Key point 1", "Key point 2"]
}`;
}

// Convert markdown to HTML
function convertMarkdownToHtml(content: string): string {
  if (!content) return content;
  
  let html = content;
  
  // Convert markdown headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Convert bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Convert markdown links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  return html;
}

// Validate internal links
function validateInternalLinks(content: string, validUrlSet: Set<string>, logger: Logger): string {
  if (!content) return content;
  
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  let invalidCount = 0;
  
  let result = content;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1];
    
    if (href.startsWith('/') || href.startsWith('#')) continue;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (!validUrlSet.has(href)) {
        const slug = href.split('/').pop()?.replace(/\/$/, '') || '';
        if (!validUrlSet.has(slug)) {
          result = result.replace(match[0], `<!-- removed invalid link: ${href} --><span`);
          invalidCount++;
        }
      }
    }
  }
  
  if (invalidCount > 0) {
    logger.warn('Removed invalid internal links', { count: invalidCount });
  }
  
  return result;
}

// JSON repair helpers
const escapeNewlinesInJsonStrings = (s: string): string => {
  let inString = false;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
    }
    if (inString && c === '\n') {
      out += '\\n';
    } else if (inString && c === '\r') {
      // skip
    } else {
      out += c;
    }
  }
  return out;
};

const repairJsonStringForParsing = (raw: string): string => {
  let s = raw.replace(/\r/g, '');
  s = s.replace(/="([^"]*)"/g, "='$1'");
  s = escapeNewlinesInJsonStrings(s);
  return s;
};

// ============================================================
// BACKGROUND JOB PROCESSOR
// ============================================================
async function processOptimizationJob(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  lovableApiKey: string | undefined,
  jobId: string,
  pageId: string,
  request: OptimizeRequest,
  logger: Logger
) {
  const { siteUrl, username, applicationPassword, targetKeyword, language, aiConfig, neuronWriter, advanced, siteContext } = request;
  
  const effectiveAdvanced: AdvancedSettings = {
    targetScore: advanced?.targetScore ?? 85,
    minWordCount: advanced?.minWordCount ?? 2000,
    maxWordCount: advanced?.maxWordCount ?? 3000,
    enableFaqs: advanced?.enableFaqs ?? true,
    enableSchema: advanced?.enableSchema ?? true,
    enableInternalLinks: advanced?.enableInternalLinks ?? true,
    enableToc: advanced?.enableToc ?? true,
    enableKeyTakeaways: advanced?.enableKeyTakeaways ?? true,
    enableCtas: advanced?.enableCtas ?? true,
  };

  try {
    const useUserAI = aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model;
    
    if (!useUserAI && !lovableApiKey) {
      throw new Error('No AI provider configured.');
    }

    // Fetch page data
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError || !pageData) {
      throw new Error('Page not found in database');
    }

    // Fetch internal link candidates
    await updateJobProgress(supabase, jobId, 'fetching_sitemap_pages', 15, logger);
    
    const { data: allPages } = await supabase
      .from('pages')
      .select('url, slug, title')
      .neq('id', pageId)
      .limit(200);

    const internalLinkCandidates: InternalLinkCandidate[] = (allPages || []).map((p: any) => ({
      url: p.url,
      slug: p.slug,
      title: p.title,
    }));

    const validUrlSet = new Set(internalLinkCandidates.map(l => l.url));
    internalLinkCandidates.forEach(l => validUrlSet.add(l.slug));

    logger.info('Fetched internal link candidates', { count: internalLinkCandidates.length });

    await updateJobProgress(supabase, jobId, 'fetching_wordpress', 20, logger);

    // Fetch WordPress content
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);
    
    let pageContent = '';
    let pageTitle = pageData.title;

    if (pageData.post_id) {
      try {
        const wpResponse = await withRetry(
          () => fetch(
            `${normalizedUrl}/wp-json/wp/v2/posts/${pageData.post_id}?context=edit`,
            {
              headers: {
                'Accept': 'application/json',
                'Authorization': authHeader,
                'User-Agent': 'WP-Optimizer-Pro/1.0',
              },
            }
          ),
          { maxRetries: 2, initialDelayMs: 500, retryableStatuses: [408, 429, 500, 502, 503, 504] }
        );

        if (wpResponse.ok) {
          const wpData = await wpResponse.json();
          pageContent = wpData.content?.raw || wpData.content?.rendered || '';
          pageTitle = wpData.title?.raw || wpData.title?.rendered || pageTitle;
          logger.info('Fetched WP content', { chars: pageContent.length });
        }
      } catch (e) {
        logger.warn('Could not fetch WP content', { error: e instanceof Error ? e.message : 'Unknown' });
      }
    }

    // Derive keyword
    const effectiveKeyword = targetKeyword || deriveKeyword(pageTitle, pageData.slug);
    logger.info('Using keyword', { keyword: effectiveKeyword });

    // Fetch NeuronWriter recommendations
    await updateJobProgress(supabase, jobId, 'fetching_neuronwriter', 30, logger);
    
    let neuronWriterData: NeuronWriterRecommendations | null = null;
    if (neuronWriter?.enabled && neuronWriter?.apiKey && neuronWriter?.projectId) {
      neuronWriterData = await fetchNeuronWriterRecommendations(
        supabaseUrl,
        supabaseKey,
        neuronWriter,
        effectiveKeyword,
        language || 'English',
        logger,
        jobId,
        supabase
      );
    }

    await updateJobProgress(supabase, jobId, 'analyzing_content', 40, logger);

    // Build prompt
    const userPrompt = buildOptimizationPrompt(
      pageTitle,
      pageContent,
      effectiveKeyword,
      internalLinkCandidates,
      neuronWriterData,
      effectiveAdvanced,
      siteContext
    );

    const OPTIMIZATION_PROMPT = `You are an expert SEO content optimizer. You analyze content and rewrite it to maximize search rankings while maintaining readability and user engagement. Always return valid JSON.`;

    await updateJobProgress(supabase, jobId, 'generating_content', 50, logger);

    // Build AI request
    const messages = [
      { role: 'system', content: OPTIMIZATION_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    interface AIRequest {
      url: string;
      headers: Record<string, string>;
      body: string;
    }

    const buildAIRequest = (): AIRequest => {
      if (useUserAI && aiConfig) {
        const { provider, apiKey, model } = aiConfig;
        
        switch (provider) {
          case 'google':
            return {
              url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${OPTIMIZATION_PROMPT}\n\n${userPrompt}` }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
              }),
            };

          case 'openai':
            return {
              url: 'https://api.openai.com/v1/chat/completions',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 32000 }),
            };

          case 'anthropic':
            return {
              url: 'https://api.anthropic.com/v1/messages',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({ model, system: OPTIMIZATION_PROMPT, messages: [{ role: 'user', content: userPrompt }], max_tokens: 32000 }),
            };

          case 'groq':
            return {
              url: 'https://api.groq.com/openai/v1/chat/completions',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 32000 }),
            };

          case 'openrouter':
            return {
              url: 'https://openrouter.ai/api/v1/chat/completions',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://wp-optimizer-pro.lovable.app',
                'X-Title': 'WP Optimizer Pro',
              },
              body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 32000 }),
            };

          default:
            throw new Error(`Unsupported AI provider: ${provider}`);
        }
      }

      return {
        url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableApiKey}` },
        body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages, temperature: 0.7, max_tokens: 32000 }),
      };
    };

    const aiRequest = buildAIRequest();

    // Call AI with 180 second timeout
    const aiController = new AbortController();
    const aiTimeoutId = setTimeout(() => aiController.abort(), 180000);

    let aiResponse: Response;
    try {
      aiResponse = await withRetry(
        () => fetch(aiRequest.url, {
          method: 'POST',
          headers: aiRequest.headers,
          body: aiRequest.body,
          signal: aiController.signal,
        }),
        { maxRetries: 2, initialDelayMs: 2000, retryableStatuses: [429, 500, 502, 503, 504] }
      );
      clearTimeout(aiTimeoutId);
    } catch (aiErr) {
      clearTimeout(aiTimeoutId);
      if (aiErr instanceof Error && aiErr.name === 'AbortError') {
        throw new Error('AI request timed out after 180 seconds');
      }
      throw aiErr;
    }

    await updateJobProgress(supabase, jobId, 'processing_response', 80, logger);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('AI error', { status: aiResponse.status, body: errorText.substring(0, 500) });
      
      if (aiResponse.status === 429) {
        throw new Error('Too many requests. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Please add credits to your Lovable workspace.');
      }
      
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    let aiContent: string | undefined;
    if (useUserAI && aiConfig?.provider === 'google') {
      aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (useUserAI && aiConfig?.provider === 'anthropic') {
      aiContent = aiData.content?.[0]?.text;
    } else {
      aiContent = aiData.choices?.[0]?.message?.content;
    }

    if (!aiContent) {
      throw new Error('No response from AI');
    }

    logger.info('AI response received', { contentLength: aiContent.length });

    // Parse JSON response
    let jsonStr = aiContent;
    const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const firstBrace = aiContent.indexOf('{');
      const lastBrace = aiContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = aiContent.substring(firstBrace, lastBrace + 1);
      }
    }

    jsonStr = repairJsonStringForParsing(jsonStr);

    let optimization: Record<string, unknown>;
    try {
      optimization = JSON.parse(jsonStr);
    } catch (parseErr) {
      logger.error('JSON parse error', { error: parseErr instanceof Error ? parseErr.message : 'Unknown', snippet: jsonStr.substring(0, 200) });
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate required fields
    const requiredFields = ['optimizedTitle', 'metaDescription', 'h1', 'h2s', 'optimizedContent', 'contentStrategy', 'qualityScore'];
    for (const field of requiredFields) {
      if (!optimization[field]) {
        throw new Error(`AI response missing field: ${field}`);
      }
    }

    await updateJobProgress(supabase, jobId, 'validating_content', 90, logger);

    // Post-process content
    optimization.optimizedContent = convertMarkdownToHtml(optimization.optimizedContent as string);
    optimization.optimizedContent = validateInternalLinks(optimization.optimizedContent as string, validUrlSet, logger);

    // Validate content length
    const contentLength = (optimization.optimizedContent as string)?.length || 0;
    if (contentLength < 3000) {
      throw new Error(`Content too short (${contentLength} chars)`);
    }

    logger.info('Content validated', { 
      contentLength, 
      wordCount: (optimization.contentStrategy as Record<string, unknown>)?.wordCount,
      qualityScore: optimization.qualityScore,
    });

    // Mark job completed
    await supabase.from('jobs').update({
      status: 'completed',
      current_step: 'optimization_complete',
      progress: 100,
      completed_at: new Date().toISOString(),
      result: optimization,
      ai_tokens_used: aiData.usage?.total_tokens || 0,
    }).eq('id', jobId);

    // Update page
    const scoreAfter = {
      overall: optimization.qualityScore || 75,
      title: optimization.optimizedTitle ? 90 : 50,
      meta: optimization.metaDescription ? 90 : 50,
      headings: (optimization.h2s as string[])?.length > 0 ? 85 : 50,
      content: (optimization.contentStrategy as Record<string, unknown>)?.readabilityScore || 60,
    };

    await supabase.from('pages').update({
      status: 'completed',
      score_after: scoreAfter,
      word_count: (optimization.contentStrategy as Record<string, unknown>)?.wordCount || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', pageId);

    // Log activity
    await supabase.from('activity_log').insert({
      page_id: pageId,
      job_id: jobId,
      type: 'success',
      message: `Optimized: ${(optimization.contentStrategy as Record<string, unknown>)?.wordCount || 0} words, score ${optimization.qualityScore}`,
      details: {
        qualityScore: optimization.qualityScore,
        wordCount: (optimization.contentStrategy as Record<string, unknown>)?.wordCount,
        internalLinks: (optimization.internalLinks as unknown[])?.length,
        usedNeuronWriter: !!neuronWriterData,
        requestId: logger.getRequestId(),
      },
    });

    logger.info('Optimization complete', { qualityScore: optimization.qualityScore });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markJobFailed(supabase, jobId, pageId, errorMessage, logger);
  }
}

// ============================================================
// MAIN SERVER
// ============================================================
serve(async (req) => {
  const logger = new Logger('optimize-content');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: OptimizeRequest = await req.json();
    const { pageId, siteUrl, username, applicationPassword } = body;

    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword']);

    logger.info('Received optimization request', { pageId, siteUrl });

    // Rate limiting
    const rateLimitKey = `optimize:${siteUrl}`;
    const rateLimit = checkRateLimit(rateLimitKey, 10, 60000);
    if (!rateLimit.allowed) {
      throw new AppError(
        `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // Check AI config
    const useUserAI = body.aiConfig?.provider && body.aiConfig?.apiKey && body.aiConfig?.model;
    if (!useUserAI && !lovableApiKey) {
      throw new AppError('No AI provider configured.', 'AI_NOT_CONFIGURED', 500);
    }

    // Update page status immediately
    await supabase.from('pages').update({ status: 'optimizing' }).eq('id', pageId);

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        page_id: pageId,
        status: 'running',
        current_step: 'queued',
        progress: 5,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new AppError('Failed to create job', 'JOB_CREATE_FAILED', 500);
    }

    const jobId = job.id;
    logger.info('Job created, starting background processing', { jobId });

    // ========================================================
    // RESPOND IMMEDIATELY - Run actual work in background
    // ========================================================
    // @ts-ignore - EdgeRuntime.waitUntil is a Deno Deploy feature
    EdgeRuntime.waitUntil(
      processOptimizationJob(
        supabase,
        supabaseUrl,
        supabaseKey,
        lovableApiKey,
        jobId,
        pageId,
        body,
        logger
      )
    );

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Optimization job started', 
        jobId,
        requestId: logger.getRequestId() 
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Request failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
