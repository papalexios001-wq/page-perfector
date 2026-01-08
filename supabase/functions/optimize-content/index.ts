import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Logger,
  withRetry,
  withIdempotency,
  generateIdempotencyKey,
  checkRateLimit,
  corsHeaders,
  AppError,
  createErrorResponse,
  validateRequired,
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

interface OptimizationResult {
  success: boolean;
  message: string;
  optimization?: {
    optimizedTitle: string;
    metaDescription: string;
    h1: string;
    h2s: string[];
    optimizedContent: string;
    contentStrategy: {
      wordCount: number;
      readabilityScore: number;
      keywordDensity: number;
      lsiKeywords: string[];
    };
    internalLinks: Array<{
      anchor: string;
      target: string;
      position: number;
    }>;
    schema: Record<string, unknown>;
    aiSuggestions: {
      contentGaps: string;
      quickWins: string;
      improvements: string[];
    };
    qualityScore: number;
    estimatedRankPosition: number;
    confidenceLevel: number;
    tableOfContents?: string[];
    faqs?: Array<{ question: string; answer: string }>;
    keyTakeaways?: string[];
  };
  cached?: boolean;
  requestId?: string;
  error?: string;
}

// Helper: Update job progress in database
async function updateJobProgress(
  supabase: any,
  jobId: string | undefined,
  step: string,
  progress: number,
  logger: Logger
) {
  if (!jobId) return;
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

// Helper: Derive keyword from title/slug
function deriveKeyword(title: string, slug: string): string {
  // Clean title - remove site name suffixes, special chars
  let keyword = title
    .replace(/\s*[-|–—]\s*.*$/, '') // Remove " - Site Name" suffix
    .replace(/[^\w\s]/g, ' ') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
    .toLowerCase();
  
  // If title is too short, use slug
  if (keyword.length < 10 && slug) {
    keyword = slug
      .replace(/-/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }
  
  return keyword.substring(0, 100); // Max 100 chars
}

// Helper: Fetch and wait for NeuronWriter recommendations
async function fetchNeuronWriterRecommendations(
  supabaseUrl: string,
  supabaseKey: string,
  neuronWriter: NeuronWriterConfig,
  keyword: string,
  language: string,
  logger: Logger,
  jobId: string | undefined,
  supabase: any
): Promise<NeuronWriterRecommendations | null> {
  const maxAttempts = 12; // 12 attempts * 10 seconds = 2 minutes max
  const pollInterval = 10000; // 10 seconds
  
  logger.info('Creating NeuronWriter query', { keyword, projectId: neuronWriter.projectId });
  
  // Step 1: Create or find query
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
  
  // If already ready, return immediately
  if (data.status === 'ready') {
    logger.info('NeuronWriter recommendations ready immediately');
    return data;
  }
  
  // If processing, poll until ready
  if (data.status === 'processing' || data.status === 'waiting' || data.status === 'in progress') {
    const queryId = data.queryId;
    if (!queryId) {
      logger.warn('NeuronWriter returned processing status but no queryId');
      return null;
    }
    
    logger.info('NeuronWriter processing, will poll for results', { queryId });
    await updateJobProgress(supabase, jobId, 'waiting_neuronwriter', 35, logger);
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      logger.info(`Polling NeuronWriter (attempt ${attempt + 1}/${maxAttempts})`);
      
      const pollResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          action: 'get-query',
          apiKey: neuronWriter.apiKey,
          queryId: queryId,
        }),
      });
      
      if (!pollResponse.ok) continue;
      
      const pollData = await pollResponse.json();
      
      if (pollData.success && pollData.recommendations?.status === 'ready') {
        logger.info('NeuronWriter recommendations ready after polling');
        // Transform the nested recommendations to flat format
        const rec = pollData.recommendations;
        return {
          success: true,
          status: 'ready',
          queryId,
          targetWordCount: rec.metrics?.word_count?.target,
          readabilityTarget: rec.metrics?.readability?.target,
          titleTerms: rec.terms_txt?.title,
          h1Terms: rec.terms_txt?.h1,
          h2Terms: rec.terms_txt?.h2,
          contentTerms: rec.terms_txt?.content_basic_w_ranges || rec.terms_txt?.content_basic,
          entities: rec.terms_txt?.entities,
          questions: {
            suggested: (rec.ideas?.suggest_questions || []).map((q: { q: string }) => q.q),
            peopleAlsoAsk: (rec.ideas?.people_also_ask || []).map((q: { q: string }) => q.q),
            contentQuestions: (rec.ideas?.content_questions || []).map((q: { q: string }) => q.q),
          },
          competitors: (rec.competitors || []).slice(0, 5).map((c: { rank: number; url: string; title: string; content_score?: number }) => ({
            rank: c.rank,
            url: c.url,
            title: c.title,
            score: c.content_score,
          })),
        };
      }
    }
    
    logger.warn('NeuronWriter timed out waiting for recommendations');
  }
  
  return null;
}

// Build dynamic prompt based on advanced settings
function buildOptimizationPrompt(
  advanced: AdvancedSettings, 
  siteContext: SiteContext | undefined,
  internalLinkCandidates: InternalLinkCandidate[]
): string {
  const minWords = advanced.minWordCount || 2000;
  const maxWords = advanced.maxWordCount || 3000;
  const targetScore = advanced.targetScore || 85;
  
  const brandVoice = siteContext?.brandVoice || 'professional';
  const industry = siteContext?.industry || 'general';
  const audience = siteContext?.targetAudience || 'general audience';
  const orgName = siteContext?.organizationName || '';
  
  // Build enhancements list
  const enhancements: string[] = [];
  if (advanced.enableToc) enhancements.push('TABLE OF CONTENTS');
  if (advanced.enableFaqs) enhancements.push('5-7 FAQs');
  if (advanced.enableKeyTakeaways) enhancements.push('KEY TAKEAWAYS BOX');
  if (advanced.enableCtas) enhancements.push('STRONG CTAs');
  if (advanced.enableSchema) enhancements.push('STRUCTURED DATA/SCHEMA');
  if (advanced.enableInternalLinks) enhancements.push('6-12 INTERNAL LINKS');
  
  // Build internal links section
  const internalLinksSection = internalLinkCandidates.length > 0 ? `
═══════════════════════════════════════════════════════════════
🔗 AVAILABLE INTERNAL LINKS (USE ONLY THESE URLs!)
═══════════════════════════════════════════════════════════════

You MUST ONLY use internal links from this list. DO NOT invent URLs.
Include 6-12 of these links naturally throughout the content:

${internalLinkCandidates.slice(0, 50).map(link => `- ${link.url} → "${link.title}"`).join('\n')}

INTERNAL LINK RULES:
1. ONLY use URLs from the list above - NO exceptions
2. Use RICH, DESCRIPTIVE anchor text (NOT "click here" or "read more")
3. Match anchor text to the target page topic
4. Format: <a href='${internalLinkCandidates[0]?.url || '/example-page/'}' class='wp-opt-internal'>[anchor text]</a>
5. Distribute links naturally throughout content (not clustered)
` : '';

  return `You are an ELITE SEO content strategist creating PRODUCTION-READY HTML content.

═══════════════════════════════════════════════════════════════
ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════

📏 WORD COUNT: ${minWords}-${maxWords} words (STRICTLY ENFORCED)
🎯 QUALITY TARGET: ${targetScore}+ score
📊 REQUIRED ENHANCEMENTS: ${enhancements.join(', ')}

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT: PURE HTML ONLY
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: Output ONLY valid HTML. NO markdown whatsoever.
- Use <h2> NOT ## for headings
- Use <h3> NOT ### for subheadings
- Use <p> for paragraphs
- Use <ul><li> for lists
- Use <strong> for bold
- Use <em> for italics
- Use <a href='...'> for links
- Use SINGLE QUOTES for all HTML attributes

═══════════════════════════════════════════════════════════════
BRAND & AUDIENCE CONTEXT
═══════════════════════════════════════════════════════════════

${orgName ? `Organization: ${orgName}` : ''}
Industry: ${industry}
Target Audience: ${audience}
Brand Voice: ${brandVoice}
${internalLinksSection}
═══════════════════════════════════════════════════════════════
WRITING STYLE (HORMOZI-INSPIRED SEO COPYWRITING)
═══════════════════════════════════════════════════════════════

✅ SHORT PARAGRAPHS: 2-3 sentences MAX
✅ CONVERSATIONAL: Use "you" constantly
✅ SPECIFIC NUMBERS: "87% of users..." NOT "most users..."
✅ POWER WORDS: Discover, Proven, Secret, Revolutionary
✅ SCANNABLE: Headers, bullets, numbered lists

═══════════════════════════════════════════════════════════════
CONTENT STRUCTURE
═══════════════════════════════════════════════════════════════

1. TL;DR BOX (top):
   <div class='wp-opt-tldr'><strong>⚡ TL;DR:</strong> [summary]</div>

2. TABLE OF CONTENTS (if enabled):
   <div class='wp-opt-toc'><strong>📑 What You'll Learn:</strong><ul><li>...</li></ul></div>

3. MAIN CONTENT (6-10 H2s, each with 2-4 H3s)

4. SPECIAL BOXES (use throughout):
   <div class='wp-opt-insight'><strong>💡 Key Insight:</strong> [text]</div>
   <div class='wp-opt-tip'><strong>🚀 Pro Tip:</strong> [text]</div>
   <div class='wp-opt-warning'><strong>⚠️ Warning:</strong> [text]</div>
   <div class='wp-opt-stat'><strong>📊 Did You Know?</strong> [text]</div>
   <div class='wp-opt-example'><strong>📋 Example:</strong> [text]</div>

5. KEY TAKEAWAYS (if enabled):
   <div class='wp-opt-takeaways'><strong>🔑 Key Takeaways:</strong><ul><li>✅ ...</li></ul></div>

6. FAQ SECTION (if enabled):
   <div class='wp-opt-faq'><h3>❓ [Question]</h3><p>[Answer]</p></div>

7. CTA (if enabled):
   <div class='wp-opt-cta'><strong>🚀 [CTA Title]</strong><p>[CTA text]</p></div>

═══════════════════════════════════════════════════════════════
JSON OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON. Use SINGLE QUOTES for HTML attributes.

{
  "optimizedTitle": "[50-60 chars, keyword at start]",
  "metaDescription": "[150-160 chars, keyword, benefit, CTA]",
  "h1": "[Compelling H1 with keyword]",
  "h2s": ["[6-10 H2 subheadings]"],
  "optimizedContent": "[FULL HTML content ${minWords}-${maxWords} words - NO MARKDOWN]",
  "contentStrategy": {
    "wordCount": [actual count ${minWords}-${maxWords}],
    "readabilityScore": [60-80],
    "keywordDensity": [1.0-2.0],
    "lsiKeywords": ["semantic keywords"]
  },
  "internalLinks": [
    {"anchor": "[text]", "target": "[URL from list above]", "position": [number]}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "[title]",
    "description": "[meta]"
  },
  "aiSuggestions": {
    "contentGaps": "[gaps]",
    "quickWins": "[wins]",
    "improvements": ["[steps]"]
  },
  "tableOfContents": ["[sections]"],
  "faqs": [{"question": "...", "answer": "..."}],
  "keyTakeaways": ["[points]"],
  "qualityScore": [${targetScore}+],
  "estimatedRankPosition": [1-10],
  "confidenceLevel": [0.80-0.95]
}`;
}

// Helper: Convert any markdown in content to HTML
function convertMarkdownToHtml(content: string): string {
  let html = content;
  
  // Convert markdown headings to HTML
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Convert bold **text** to <strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert italic *text* to <em>
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Convert markdown links [text](url) to <a href>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2'>$1</a>");
  
  // Convert unordered lists (basic)
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');
  
  return html;
}

// Helper: Validate and fix internal links
function validateInternalLinks(
  content: string,
  validUrls: Set<string>,
  logger: Logger
): string {
  // Find all internal links in content
  const linkRegex = /<a\s+href=['"]([^'"]+)['"]/gi;
  let match;
  let fixedContent = content;
  const invalidLinks: string[] = [];
  
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1];
    
    // Skip external links
    if (href.startsWith('http://') || href.startsWith('https://')) continue;
    if (href.startsWith('#')) continue; // Anchor links
    
    // Check if internal link exists in our valid URLs
    const normalizedHref = href.replace(/^\//, '').replace(/\/$/, '');
    let found = false;
    
    for (const validUrl of validUrls) {
      const normalizedValid = validUrl.replace(/^\//, '').replace(/\/$/, '');
      if (normalizedValid === normalizedHref || validUrl.includes(normalizedHref)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      invalidLinks.push(href);
      // Remove invalid link but keep anchor text
      const fullLinkRegex = new RegExp(`<a\\s+href=['"]${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"][^>]*>([^<]+)</a>`, 'gi');
      fixedContent = fixedContent.replace(fullLinkRegex, '<strong>$1</strong>');
    }
  }
  
  if (invalidLinks.length > 0) {
    logger.warn('Removed invalid internal links', { count: invalidLinks.length, links: invalidLinks.slice(0, 5) });
  }
  
  return fixedContent;
}

const escapeNewlinesInJsonStrings = (input: string): string => {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        continue;
      }

      if (!escaped && ch === '"') {
        inString = false;
        out += ch;
        continue;
      }

      if (!escaped && ch === '\\') {
        escaped = true;
        out += ch;
        continue;
      }

      escaped = false;
      out += ch;
      continue;
    }

    out += ch;
    if (ch === '"') {
      inString = true;
      escaped = false;
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

serve(async (req) => {
  const idempotencyKey = req.headers.get('x-idempotency-key');
  const logger = new Logger('optimize-content');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  let pageId: string | undefined;
  let jobId: string | undefined;

  try {
    const body: OptimizeRequest = await req.json();
    pageId = body.pageId;
    const { siteUrl, username, applicationPassword, targetKeyword, language, region, aiConfig, neuronWriter, advanced, siteContext } = body;

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

    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword']);

    logger.info('Starting optimization', { 
      pageId, 
      siteUrl, 
      aiProvider: aiConfig?.provider || 'lovable-default',
      aiModel: aiConfig?.model || 'google/gemini-2.5-flash',
      minWords: effectiveAdvanced.minWordCount,
      maxWords: effectiveAdvanced.maxWordCount,
    });

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

    const useUserAI = aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model;
    
    if (!useUserAI && !lovableApiKey) {
      throw new AppError('No AI provider configured.', 'AI_NOT_CONFIGURED', 500);
    }

    // Update page status
    await supabase.from('pages').update({ status: 'optimizing' }).eq('id', pageId);

    // Create job record
    const { data: job } = await supabase
      .from('jobs')
      .insert({
        page_id: pageId,
        status: 'running',
        current_step: 'fetching_content',
        progress: 10,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    jobId = job?.id;
    logger.info('Job created', { jobId });

    // Fetch page data
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError || !pageData) {
      throw new AppError('Page not found in database', 'PAGE_NOT_FOUND', 404);
    }

    // Fetch ALL pages from sitemap for internal linking
    await updateJobProgress(supabase, jobId, 'fetching_sitemap_pages', 15, logger);
    
    const { data: allPages } = await supabase
      .from('pages')
      .select('url, slug, title')
      .neq('id', pageId) // Exclude current page
      .eq('site_id', pageData.site_id)
      .limit(200);

    const internalLinkCandidates: InternalLinkCandidate[] = (allPages || []).map(p => ({
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

    // Derive keyword from title if not provided
    const effectiveKeyword = targetKeyword || deriveKeyword(pageTitle, pageData.slug);
    logger.info('Using keyword', { keyword: effectiveKeyword });

    // Fetch NeuronWriter recommendations if enabled
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

    // Build NeuronWriter context section
    const neuronWriterSection = neuronWriterData?.status === 'ready' ? `
═══════════════════════════════════════════════════════════════
🧠 NEURONWRITER SEO INTELLIGENCE (USE THIS DATA!)
═══════════════════════════════════════════════════════════════

📊 TARGET METRICS:
- Recommended Word Count: ${neuronWriterData.targetWordCount || 'N/A'}
- Readability Target: ${neuronWriterData.readabilityTarget || 'N/A'}

📝 TITLE TERMS (include in title):
${neuronWriterData.titleTerms || 'N/A'}

📌 H1 TERMS (include in H1):
${neuronWriterData.h1Terms || 'N/A'}

📌 H2 TERMS (use in subheadings):
${neuronWriterData.h2Terms || 'N/A'}

🔤 CONTENT TERMS WITH USAGE RANGES (CRITICAL!):
${neuronWriterData.contentTerms || 'N/A'}

🏷️ ENTITIES TO COVER:
${neuronWriterData.entities || 'N/A'}

❓ PEOPLE ALSO ASK (use for FAQ):
${neuronWriterData.questions?.peopleAlsoAsk?.slice(0, 7).join('\n') || 'N/A'}

❓ CONTENT QUESTIONS (answer in content):
${neuronWriterData.questions?.contentQuestions?.slice(0, 7).join('\n') || 'N/A'}

🏆 TOP COMPETITORS:
${neuronWriterData.competitors?.map(c => `#${c.rank}: ${c.title} (Score: ${c.score || 'N/A'})`).join('\n') || 'N/A'}
` : '';

    // Build the prompt
    const OPTIMIZATION_PROMPT = buildOptimizationPrompt(effectiveAdvanced, siteContext, internalLinkCandidates);

    const userPrompt = `
OPTIMIZE THIS PAGE FOR MAXIMUM SEO/GEO/AEO PERFORMANCE:
${neuronWriterSection}
═══════════════════════════════════════════════════════════════
PAGE DETAILS
═══════════════════════════════════════════════════════════════
URL: ${pageData.url}
Current Title: ${pageTitle}
Target Keyword: ${effectiveKeyword}
Language: ${language || 'en'}
Region: ${region || 'global'}
Current Word Count: ${pageData.word_count || 'unknown'}

═══════════════════════════════════════════════════════════════
CURRENT CONTENT
═══════════════════════════════════════════════════════════════
${pageContent ? pageContent.substring(0, 10000) : '[No content - create from scratch]'}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════
1. Create COMPLETE ${effectiveAdvanced.minWordCount}-${effectiveAdvanced.maxWordCount} word content
2. Use ONLY internal links from the provided list
3. Output PURE HTML (NO markdown)
4. Include all required boxes and sections

Generate the optimized content now.`;

    logger.info('Calling AI', { promptLength: userPrompt.length });

    await updateJobProgress(supabase, jobId, 'generating_content', 50, logger);

    // Build AI request
    const buildAIRequest = (): { url: string; headers: HeadersInit; body: string } => {
      const messages = [
        { role: 'system', content: OPTIMIZATION_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      if (useUserAI && aiConfig) {
        const { provider, apiKey, model } = aiConfig;

        switch (provider) {
          case 'google':
            return {
              url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: OPTIMIZATION_PROMPT + '\n\n' + userPrompt }] }],
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
            throw new AppError(`Unsupported AI provider: ${provider}`, 'INVALID_PROVIDER', 400);
        }
      }

      return {
        url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableApiKey}` },
        body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages, temperature: 0.7, max_tokens: 32000 }),
      };
    };

    const aiRequest = buildAIRequest();

    // Call AI with 180 second timeout (no client-side abort)
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
        await supabase.from('jobs').update({ status: 'failed', error_message: 'AI request timed out' }).eq('id', jobId);
        await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
        throw new AppError('AI request timed out after 180 seconds', 'AI_TIMEOUT', 504);
      }
      throw aiErr;
    }

    await updateJobProgress(supabase, jobId, 'processing_response', 80, logger);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('AI error', { status: aiResponse.status, body: errorText.substring(0, 500) });
      
      if (aiResponse.status === 429) {
        await supabase.from('jobs').update({ status: 'failed', error_message: 'Rate limited' }).eq('id', jobId);
        throw new AppError('Too many requests. Please try again later.', 'AI_RATE_LIMIT', 429);
      }
      if (aiResponse.status === 402) {
        await supabase.from('jobs').update({ status: 'failed', error_message: 'Credits required' }).eq('id', jobId);
        throw new AppError('Please add credits to your Lovable workspace.', 'CREDITS_REQUIRED', 402);
      }
      
      throw new AppError(`AI request failed: ${aiResponse.status}`, 'AI_ERROR', 500);
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
      throw new AppError('No response from AI', 'AI_EMPTY_RESPONSE', 500);
    }

    logger.info('AI response received', { contentLength: aiContent.length });

    // Parse AI response
    let optimization;
    try {
      let jsonStr = aiContent.trim();

      const codeBlockMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      if (!jsonStr.startsWith('{')) {
        const jsonStart = jsonStr.indexOf('{');
        if (jsonStart !== -1) jsonStr = jsonStr.substring(jsonStart);
      }
      if (!jsonStr.endsWith('}')) {
        const jsonEnd = jsonStr.lastIndexOf('}');
        if (jsonEnd !== -1) jsonStr = jsonStr.substring(0, jsonEnd + 1);
      }

      jsonStr = repairJsonStringForParsing(jsonStr);
      optimization = JSON.parse(jsonStr);
    } catch (e) {
      logger.error('Failed to parse AI response', { error: e instanceof Error ? e.message : 'Unknown' });
      await supabase.from('jobs').update({ status: 'failed', error_message: 'Failed to parse AI response' }).eq('id', jobId);
      throw new AppError('Failed to parse AI optimization response', 'AI_PARSE_ERROR', 500);
    }

    // Validate required fields
    const requiredFields = ['optimizedTitle', 'metaDescription', 'h1', 'h2s', 'optimizedContent', 'contentStrategy', 'qualityScore'];
    for (const field of requiredFields) {
      if (!optimization[field]) {
        throw new AppError(`AI response missing field: ${field}`, 'AI_INCOMPLETE_RESPONSE', 500);
      }
    }

    // Post-process content
    await updateJobProgress(supabase, jobId, 'validating_content', 90, logger);

    // Convert any markdown to HTML
    optimization.optimizedContent = convertMarkdownToHtml(optimization.optimizedContent);

    // Validate and fix internal links
    optimization.optimizedContent = validateInternalLinks(optimization.optimizedContent, validUrlSet, logger);

    // Validate content length
    const contentLength = optimization.optimizedContent?.length || 0;
    if (contentLength < 3000) {
      logger.error('Content too short', { length: contentLength });
      throw new AppError(`Content too short (${contentLength} chars)`, 'AI_CONTENT_TOO_SHORT', 500);
    }

    logger.info('Content validated', { 
      contentLength, 
      wordCount: optimization.contentStrategy?.wordCount,
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
      headings: optimization.h2s?.length > 0 ? 85 : 50,
      content: optimization.contentStrategy?.readabilityScore || 60,
    };

    await supabase.from('pages').update({
      status: 'completed',
      score_after: scoreAfter,
      word_count: optimization.contentStrategy?.wordCount || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', pageId);

    // Log activity
    await supabase.from('activity_log').insert({
      page_id: pageId,
      job_id: jobId,
      type: 'success',
      message: `Optimized: ${optimization.contentStrategy?.wordCount || 0} words, score ${optimization.qualityScore}`,
      details: {
        qualityScore: optimization.qualityScore,
        wordCount: optimization.contentStrategy?.wordCount,
        internalLinks: optimization.internalLinks?.length,
        usedNeuronWriter: !!neuronWriterData,
        requestId: logger.getRequestId(),
      },
    });

    logger.info('Optimization complete', { qualityScore: optimization.qualityScore });

    return new Response(
      JSON.stringify({ success: true, message: 'Page optimized successfully', optimization, requestId: logger.getRequestId() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Optimization failed', { error: error instanceof Error ? error.message : 'Unknown', pageId });

    if (jobId) {
      await supabase.from('jobs').update({ 
        status: 'failed', 
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    if (pageId) {
      await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
      await supabase.from('activity_log').insert({
        page_id: pageId,
        job_id: jobId,
        type: 'error',
        message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`,
        details: { requestId: logger.getRequestId() },
      });
    }

    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
