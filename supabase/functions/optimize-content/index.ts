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

// Build dynamic prompt based on advanced settings
function buildOptimizationPrompt(advanced: AdvancedSettings, siteContext?: SiteContext): string {
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
  
  return `You are an ELITE SEO content strategist and copywriter combining the persuasive power of Alex Hormozi with the technical precision of enterprise SEO. Your mission: transform mediocre content into TRAFFIC-DRIVING, RANKING-DOMINATING, CONVERSION-OPTIMIZED masterpieces.

═══════════════════════════════════════════════════════════════
ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════

📏 WORD COUNT: ${minWords}-${maxWords} words (STRICTLY ENFORCED)
🎯 QUALITY TARGET: ${targetScore}+ score
🔗 INTERNAL LINKS: EXACTLY 6-12 internal links with RICH, DESCRIPTIVE anchor text
📊 REQUIRED ENHANCEMENTS: ${enhancements.join(', ')}

═══════════════════════════════════════════════════════════════
BRAND & AUDIENCE CONTEXT
═══════════════════════════════════════════════════════════════

${orgName ? `Organization: ${orgName}` : ''}
Industry: ${industry}
Target Audience: ${audience}
Brand Voice: ${brandVoice}

═══════════════════════════════════════════════════════════════
WRITING STYLE (HORMOZI-INSPIRED SEO COPYWRITING)
═══════════════════════════════════════════════════════════════

✅ SHORT PARAGRAPHS: 2-3 sentences MAX. White space is your friend.
✅ CONVERSATIONAL: Use "you" constantly. Write like you're talking to ONE person.
✅ SPECIFIC NUMBERS: "87% of users..." NOT "most users..."
✅ POWER WORDS: Discover, Proven, Secret, Revolutionary, Breakthrough, Exclusive
✅ PATTERN INTERRUPTS: Questions, bold statements, unexpected transitions
✅ BENEFIT-FOCUSED: Every feature needs a "so what?" explanation
✅ SCANNABLE: Headers, bullets, numbered lists, boxes for key info
✅ EMOTIONAL HOOKS: Pain points → Agitation → Solution

═══════════════════════════════════════════════════════════════
CONTENT STRUCTURE (FOLLOW THIS EXACTLY)
═══════════════════════════════════════════════════════════════

1. 🎯 TL;DR BOX (top of article)
   <div class='wp-opt-tldr'><strong>⚡ TL;DR:</strong> [3-4 sentence summary with main takeaway]</div>

2. 📑 TABLE OF CONTENTS (if enabled)
   <div class='wp-opt-toc'><strong>📑 What You'll Learn:</strong><ul><li>...</li></ul></div>

3. 🔥 HOOK (first paragraph)
   Start with shocking stat, bold claim, or provocative question

4. 📖 MAIN CONTENT SECTIONS (6-10 H2s, each with 2-4 H3s)
   - Each section: 200-400 words
   - Include at least one special box per section
   - Add internal links naturally within content

5. 💡 KEY TAKEAWAYS BOX (if enabled)
   <div class='wp-opt-takeaways'><strong>🔑 Key Takeaways:</strong><ul><li>✅ ...</li></ul></div>

6. ❓ FAQ SECTION (if enabled)
   <div class='wp-opt-faq'><h3>❓ [Question]</h3><p>[Answer 2-3 sentences]</p></div>

7. 🚀 STRONG CTA (if enabled)
   <div class='wp-opt-cta'><strong>🚀 Ready to [Action]?</strong><p>[Compelling call-to-action]</p></div>

═══════════════════════════════════════════════════════════════
SPECIAL HTML ELEMENTS (USE THROUGHOUT - SINGLE QUOTES ONLY!)
═══════════════════════════════════════════════════════════════

<div class='wp-opt-tldr'><strong>⚡ TL;DR:</strong> [summary]</div>
<div class='wp-opt-toc'><strong>📑 Contents:</strong><ul><li>...</li></ul></div>
<div class='wp-opt-insight'><strong>💡 Key Insight:</strong> [insight]</div>
<div class='wp-opt-tip'><strong>🚀 Pro Tip:</strong> [actionable tip]</div>
<div class='wp-opt-warning'><strong>⚠️ Warning:</strong> [what to avoid]</div>
<div class='wp-opt-example'><strong>📋 Example:</strong> [real-world example]</div>
<div class='wp-opt-stat'><strong>📊 Did You Know?</strong> [surprising statistic]</div>
<div class='wp-opt-quote'><blockquote>[expert quote]</blockquote><cite>— [Source]</cite></div>
<div class='wp-opt-takeaways'><strong>🔑 Key Takeaways:</strong><ul><li>✅ ...</li></ul></div>
<div class='wp-opt-faq'><h3>❓ [Question]</h3><p>[Answer]</p></div>
<div class='wp-opt-cta'><strong>🚀 [CTA Headline]</strong><p>[CTA text]</p></div>
<div class='wp-opt-comparison'><strong>⚖️ Quick Comparison:</strong>[comparison content]</div>
<div class='wp-opt-checklist'><strong>✅ Checklist:</strong><ul><li>☐ ...</li></ul></div>

Use ✅ for benefits, ❌ for mistakes/myths, 👉 for actions, 💰 for money/value, ⏱️ for time

═══════════════════════════════════════════════════════════════
INTERNAL LINKING REQUIREMENTS (CRITICAL!)
═══════════════════════════════════════════════════════════════

You MUST include EXACTLY 6-12 internal links with these rules:
- Use RICH, DESCRIPTIVE anchor text (NOT "click here" or "read more")
- Good: "comprehensive guide to email marketing automation"
- Bad: "this article" or "here"
- Distribute links naturally throughout the content
- Link to related topics, deeper dives, and complementary content
- Format: <a href='/[slug]' class='wp-opt-internal'>[rich anchor text]</a>

═══════════════════════════════════════════════════════════════
SEO/GEO/AEO OPTIMIZATION
═══════════════════════════════════════════════════════════════

SEO (Search Engine Optimization):
- Target keyword in H1, first paragraph, and 2-3 H2s
- Keyword density: 1-2% (natural, not stuffed)
- Include 8-12 LSI/semantic keywords throughout
- Use long-tail variations in H3s

GEO (Generative Engine Optimization - for AI answers):
- Include direct, factual answers to common questions
- Use structured data and clear definitions
- Format content for featured snippets
- Include "What is...", "How to...", "Why..." sections

AEO (Answer Engine Optimization):
- FAQs with concise, direct answers
- Lists and step-by-step instructions
- Clear definitions and explanations
- Bullet points for scannable facts

═══════════════════════════════════════════════════════════════
JSON OUTPUT FORMAT (CRITICAL - FOLLOW EXACTLY!)
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON. No markdown, no explanation, no preamble.
Use SINGLE QUOTES for all HTML attributes inside strings.
Escape all newlines as \\n inside JSON strings.

{
  "optimizedTitle": "[50-60 chars, keyword at start, power word]",
  "metaDescription": "[150-160 chars, keyword, benefit, CTA]",
  "h1": "[Compelling H1 with keyword, slightly different from title]",
  "h2s": ["[6-10 H2 subheadings covering the topic comprehensively]"],
  "optimizedContent": "[FULL HTML content ${minWords}-${maxWords} words, all boxes, 6-12 internal links, FAQs, ToC, etc.]",
  "contentStrategy": {
    "wordCount": [actual word count - MUST be ${minWords}-${maxWords}],
    "readabilityScore": [60-80 Flesch-Kincaid],
    "keywordDensity": [1.0-2.0],
    "lsiKeywords": ["8-12 semantic keywords used"]
  },
  "internalLinks": [
    {"anchor": "[rich descriptive text]", "target": "/[slug]", "position": [word position]}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "[title]",
    "description": "[meta description]",
    "author": {"@type": "Person", "name": "[author or org]"},
    "datePublished": "[ISO date]",
    "mainEntityOfPage": {"@type": "WebPage"}
  },
  "aiSuggestions": {
    "contentGaps": "[what competitors cover that's missing]",
    "quickWins": "[easy improvements for quick ranking boost]",
    "improvements": ["[3-5 specific next steps]"]
  },
  "tableOfContents": ["[H2 sections for ToC]"],
  "faqs": [{"question": "...", "answer": "..."}],
  "keyTakeaways": ["[5-7 key points]"],
  "qualityScore": [${targetScore}+],
  "estimatedRankPosition": [1-10],
  "confidenceLevel": [0.80-0.95]
}`;
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
  // 1) Normalize line endings
  let s = raw.replace(/\r/g, '');

  // 2) Repair unescaped double quotes in HTML attributes
  s = s.replace(/="([^"]*)"/g, "='$1'");

  // 3) Escape literal newlines inside quoted JSON strings
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

  try {
    const body: OptimizeRequest = await req.json();
    pageId = body.pageId;
    const { siteUrl, username, applicationPassword, targetKeyword, language, region, aiConfig, neuronWriter, advanced, siteContext } = body;

    // Use defaults if advanced settings not provided
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

    // Fetch NeuronWriter recommendations if enabled
    let neuronWriterData: NeuronWriterRecommendations | null = null;
    if (neuronWriter?.enabled && neuronWriter?.apiKey && neuronWriter?.projectId) {
      logger.info('Fetching NeuronWriter recommendations', { projectId: neuronWriter.projectId });
      try {
        const nwResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'get-recommendations',
            apiKey: neuronWriter.apiKey,
            projectId: neuronWriter.projectId,
            keyword: targetKeyword || '',
            language: language || 'English',
          }),
        });
        if (nwResponse.ok) {
          neuronWriterData = await nwResponse.json();
          logger.info('NeuronWriter data received', { 
            status: neuronWriterData?.status,
            hasTerms: !!neuronWriterData?.contentTerms,
            hasQuestions: !!neuronWriterData?.questions,
          });
        }
      } catch (nwError) {
        logger.warn('NeuronWriter fetch failed, continuing without', { error: nwError instanceof Error ? nwError.message : 'Unknown' });
      }
    }

    // Validate required fields
    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword']);

    logger.info('Starting optimization', { 
      pageId, 
      siteUrl, 
      aiProvider: aiConfig?.provider || 'lovable-default',
      aiModel: aiConfig?.model || 'google/gemini-2.5-flash',
      minWords: effectiveAdvanced.minWordCount,
      maxWords: effectiveAdvanced.maxWordCount,
      targetScore: effectiveAdvanced.targetScore,
    });

    // Rate limiting
    const rateLimitKey = `optimize:${siteUrl}`;
    const rateLimit = checkRateLimit(rateLimitKey, 10, 60000);
    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded', { siteUrl, retryAfterMs: rateLimit.retryAfterMs });
      throw new AppError(
        `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // Determine AI configuration
    const useUserAI = aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model;
    
    if (!useUserAI && !lovableApiKey) {
      throw new AppError('No AI provider configured. Please configure an AI provider or enable Lovable AI.', 'AI_NOT_CONFIGURED', 500);
    }

    logger.info('Using AI provider', { 
      provider: useUserAI ? aiConfig!.provider : 'lovable',
      model: useUserAI ? aiConfig!.model : 'google/gemini-2.5-flash'
    });

    // Build the dynamic prompt based on settings
    const OPTIMIZATION_PROMPT = buildOptimizationPrompt(effectiveAdvanced, siteContext);

    // Idempotency check
    const idemKey = idempotencyKey || generateIdempotencyKey('optimize', pageId, Math.floor(Date.now() / 10000).toString());
    
    const { result: optimizationResponse, cached } = await withIdempotency<OptimizationResult>(
      idemKey,
      async () => {
        // Update page status to optimizing
        await supabase
          .from('pages')
          .update({ status: 'optimizing' })
          .eq('id', pageId);

        // Create job record for progress tracking
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

        const jobId = job?.id;

        // Fetch page data from database
        const { data: pageData, error: pageError } = await supabase
          .from('pages')
          .select('*')
          .eq('id', pageId)
          .single();

        if (pageError || !pageData) {
          throw new AppError('Page not found in database', 'PAGE_NOT_FOUND', 404);
        }

        logger.info('Fetching content', { url: pageData.url, postId: pageData.post_id });

        // Update job progress
        if (jobId) {
          await supabase.from('jobs').update({ current_step: 'fetching_wordpress', progress: 20 }).eq('id', jobId);
        }

        // Fetch page content from WordPress
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
              {
                maxRetries: 2,
                initialDelayMs: 500,
                retryableStatuses: [408, 429, 500, 502, 503, 504],
                onRetry: (attempt, error, delay) => {
                  logger.warn('Retrying WP content fetch', { attempt, error: error.message, delayMs: delay });
                },
              }
            );

            if (wpResponse.ok) {
              const wpData = await wpResponse.json();
              pageContent = wpData.content?.raw || wpData.content?.rendered || '';
              pageTitle = wpData.title?.raw || wpData.title?.rendered || pageTitle;
              logger.info('Fetched WP content', { chars: pageContent.length });
            }
          } catch (e) {
            logger.warn('Could not fetch WP content, using page URL for analysis', { error: e instanceof Error ? e.message : 'Unknown' });
          }
        }

        // Update job progress
        if (jobId) {
          await supabase.from('jobs').update({ current_step: 'analyzing_content', progress: 40 }).eq('id', jobId);
        }

        // Build NeuronWriter context section if available
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

🔤 CONTENT TERMS WITH USAGE RANGES (CRITICAL - include these!):
${neuronWriterData.contentTerms || 'N/A'}

🏷️ ENTITIES TO COVER (important for AI visibility):
${neuronWriterData.entities || 'N/A'}

❓ PEOPLE ALSO ASK QUESTIONS (use for FAQ section):
${neuronWriterData.questions?.peopleAlsoAsk?.join('\n') || 'N/A'}

❓ CONTENT QUESTIONS (answer these in content):
${neuronWriterData.questions?.contentQuestions?.join('\n') || 'N/A'}

🏆 TOP COMPETITORS (beat their scores):
${neuronWriterData.competitors?.map(c => `#${c.rank}: ${c.title} (Score: ${c.score || 'N/A'})`).join('\n') || 'N/A'}
` : '';

        // Build the user prompt
        const userPrompt = `
OPTIMIZE THIS PAGE FOR MAXIMUM SEO/GEO/AEO PERFORMANCE:
${neuronWriterSection}
PAGE DETAILS
═══════════════════════════════════════════════════════════════
URL: ${pageData.url}
Current Title: ${pageTitle}
Target Keyword: ${targetKeyword || 'auto-detect the primary keyword from content'}
Language: ${language || 'en'}
Region: ${region || 'global'}
Current Word Count: ${pageData.word_count || 'unknown'}

═══════════════════════════════════════════════════════════════
CURRENT CONTENT (analyze and transform this)
═══════════════════════════════════════════════════════════════
${pageContent ? pageContent.substring(0, 8000) : '[No content available - create comprehensive content based on URL/title]'}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════
1. Analyze the current content and identify the primary topic/keyword
2. Research what makes top-ranking content for this topic
3. Create a COMPLETE, COMPREHENSIVE rewrite with:
   - ${effectiveAdvanced.minWordCount}-${effectiveAdvanced.maxWordCount} words (REQUIRED)
   - 6-12 internal links with rich anchor text (REQUIRED)
   - All special content boxes (TL;DR, Tips, Insights, etc.)
   ${effectiveAdvanced.enableToc ? '- Table of Contents' : ''}
   ${effectiveAdvanced.enableFaqs ? '- 5-7 FAQ section' : ''}
   ${effectiveAdvanced.enableKeyTakeaways ? '- Key Takeaways box' : ''}
   ${effectiveAdvanced.enableCtas ? '- Strong CTAs' : ''}
   ${effectiveAdvanced.enableSchema ? '- Structured data schema' : ''}
4. Make it 10x better than anything currently ranking

Generate the COMPLETE optimized content now.`;

        logger.info('Calling AI for optimization', { promptLength: userPrompt.length });

        // Update job progress
        if (jobId) {
          await supabase.from('jobs').update({ current_step: 'generating_content', progress: 50 }).eq('id', jobId);
        }

        // Build AI request based on provider
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
                    contents: [
                      { role: 'user', parts: [{ text: OPTIMIZATION_PROMPT + '\n\n' + userPrompt }] }
                    ],
                    generationConfig: {
                      temperature: 0.7,
                      maxOutputTokens: 32000,
                    },
                  }),
                };

              case 'openai':
                return {
                  url: 'https://api.openai.com/v1/chat/completions',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens: 32000,
                  }),
                };

              case 'anthropic':
                return {
                  url: 'https://api.anthropic.com/v1/messages',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model,
                    system: OPTIMIZATION_PROMPT,
                    messages: [{ role: 'user', content: userPrompt }],
                    max_tokens: 32000,
                  }),
                };

              case 'groq':
                return {
                  url: 'https://api.groq.com/openai/v1/chat/completions',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens: 32000,
                  }),
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
                  body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens: 32000,
                  }),
                };

              default:
                throw new AppError(`Unsupported AI provider: ${provider}`, 'INVALID_PROVIDER', 400);
            }
          }

          // Default: Use Lovable AI Gateway
          return {
            url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lovableApiKey}`,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages,
              temperature: 0.7,
              max_tokens: 32000,
            }),
          };
        };

        const aiRequest = buildAIRequest();

        // Call AI with 120 second timeout (longer content = more time)
        const aiController = new AbortController();
        const aiTimeoutId = setTimeout(() => aiController.abort(), 120000);

        let aiResponse: Response;
        try {
          aiResponse = await withRetry(
            () => fetch(aiRequest.url, {
              method: 'POST',
              headers: aiRequest.headers,
              body: aiRequest.body,
              signal: aiController.signal,
            }),
            {
              maxRetries: 2,
              initialDelayMs: 2000,
              retryableStatuses: [429, 500, 502, 503, 504],
              onRetry: (attempt, error, delay) => {
                logger.warn('Retrying AI request', { attempt, error: error.message, delayMs: delay });
              },
            }
          );
          clearTimeout(aiTimeoutId);
        } catch (aiErr) {
          clearTimeout(aiTimeoutId);
          if (aiErr instanceof Error && aiErr.name === 'AbortError') {
            logger.error('AI request timeout after 120 seconds');
            if (jobId) await supabase.from('jobs').update({ status: 'failed', error_message: 'Timeout' }).eq('id', jobId);
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            throw new AppError('AI request timed out after 120 seconds. Try again.', 'AI_TIMEOUT', 504);
          }
          throw aiErr;
        }

        // Update job progress
        if (jobId) {
          await supabase.from('jobs').update({ current_step: 'processing_response', progress: 80 }).eq('id', jobId);
        }

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          logger.error('AI error response', { status: aiResponse.status, body: errorText.substring(0, 500) });
          
          if (aiResponse.status === 429) {
            if (jobId) await supabase.from('jobs').update({ status: 'failed', error_message: 'Rate limited' }).eq('id', jobId);
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            throw new AppError('Too many requests. Please try again later.', 'AI_RATE_LIMIT', 429);
          }
          
          if (aiResponse.status === 402) {
            if (jobId) await supabase.from('jobs').update({ status: 'failed', error_message: 'Credits required' }).eq('id', jobId);
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            throw new AppError('Please add credits to your Lovable workspace.', 'CREDITS_REQUIRED', 402);
          }
          
          throw new AppError(`AI request failed: ${aiResponse.status}`, 'AI_ERROR', 500);
        }

        const aiData = await aiResponse.json();
        
        // Extract content based on provider response format
        let aiContent: string | undefined;
        
        if (useUserAI && aiConfig?.provider === 'google') {
          aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (useUserAI && aiConfig?.provider === 'anthropic') {
          aiContent = aiData.content?.[0]?.text;
        } else {
          aiContent = aiData.choices?.[0]?.message?.content;
        }

        if (!aiContent) {
          logger.error('Empty AI response', { provider: aiConfig?.provider || 'lovable', responseKeys: Object.keys(aiData) });
          throw new AppError('No response from AI', 'AI_EMPTY_RESPONSE', 500);
        }

        logger.info('AI response received, parsing', { contentLength: aiContent.length });

        // Parse AI response
        let optimization;
        try {
          let jsonStr = aiContent.trim();

          // Remove markdown code blocks
          const codeBlockMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
          }

          // Find JSON object
          if (!jsonStr.startsWith('{')) {
            const jsonStart = jsonStr.indexOf('{');
            if (jsonStart !== -1) {
              jsonStr = jsonStr.substring(jsonStart);
            }
          }
          if (!jsonStr.endsWith('}')) {
            const jsonEnd = jsonStr.lastIndexOf('}');
            if (jsonEnd !== -1) {
              jsonStr = jsonStr.substring(0, jsonEnd + 1);
            }
          }

          jsonStr = repairJsonStringForParsing(jsonStr);
          optimization = JSON.parse(jsonStr);
        } catch (e) {
          logger.error('Failed to parse AI response', { content: aiContent.substring(0, 500), error: e instanceof Error ? e.message : 'Unknown' });
          if (jobId) await supabase.from('jobs').update({ status: 'failed', error_message: 'Parse error' }).eq('id', jobId);
          throw new AppError('Failed to parse AI optimization response', 'AI_PARSE_ERROR', 500);
        }

        // Validate required fields
        const requiredFields = ['optimizedTitle', 'metaDescription', 'h1', 'h2s', 'optimizedContent', 'contentStrategy', 'schema', 'qualityScore'];
        for (const field of requiredFields) {
          if (!optimization[field]) {
            logger.error('AI response missing field', { field });
            throw new AppError(`AI response missing critical field: ${field}`, 'AI_INCOMPLETE_RESPONSE', 500);
          }
        }

        // Validate content length
        const contentLength = optimization.optimizedContent?.length || 0;
        if (contentLength < 5000) {
          logger.error('optimizedContent too short', { length: contentLength });
          throw new AppError(`Content too short (${contentLength} chars). Expected ${effectiveAdvanced.minWordCount}+ words.`, 'AI_CONTENT_TOO_SHORT', 500);
        }

        logger.info('Validated response', { 
          contentLength, 
          wordCount: optimization.contentStrategy?.wordCount,
          qualityScore: optimization.qualityScore,
          internalLinks: optimization.internalLinks?.length,
        });

        // Update job to completed
        if (jobId) {
          await supabase.from('jobs').update({
            status: 'completed',
            current_step: 'optimization_complete',
            progress: 100,
            completed_at: new Date().toISOString(),
            result: optimization,
            ai_tokens_used: aiData.usage?.total_tokens || 0,
          }).eq('id', jobId);
        }

        // Update page with optimization results
        const scoreAfter = {
          overall: optimization.qualityScore || 75,
          title: optimization.optimizedTitle ? 90 : 50,
          meta: optimization.metaDescription ? 90 : 50,
          headings: optimization.h2s?.length > 0 ? 85 : 50,
          content: optimization.contentStrategy?.readabilityScore || 60,
        };

        await supabase
          .from('pages')
          .update({
            status: 'completed',
            score_after: scoreAfter,
            word_count: optimization.contentStrategy?.wordCount || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pageId);

        // Log activity
        await supabase
          .from('activity_log')
          .insert({
            page_id: pageId,
            job_id: jobId,
            type: 'success',
            message: `Optimization completed: ${optimization.contentStrategy?.wordCount || 0} words, score ${optimization.qualityScore}, ${optimization.internalLinks?.length || 0} internal links`,
            details: {
              qualityScore: optimization.qualityScore,
              wordCount: optimization.contentStrategy?.wordCount,
              internalLinks: optimization.internalLinks?.length,
              estimatedRank: optimization.estimatedRankPosition,
              requestId: logger.getRequestId(),
            },
          });

        logger.info('Successfully optimized page', { 
          qualityScore: optimization.qualityScore,
          wordCount: optimization.contentStrategy?.wordCount,
        });

        return {
          success: true,
          message: 'Page optimized successfully',
          optimization,
          requestId: logger.getRequestId(),
        };
      },
      300000 // 5 minute TTL for idempotency
    );

    if (cached) {
      logger.info('Returning cached optimization result', { pageId });
    }

    return new Response(
      JSON.stringify({ ...optimizationResponse, cached }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Optimization failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      pageId 
    });

    if (pageId) {
      try {
        await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
        await supabase.from('activity_log').insert({
          page_id: pageId,
          type: 'error',
          message: `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { requestId: logger.getRequestId() },
        });
      } catch (e) {
        logger.error('Failed to update error status', { error: e instanceof Error ? e.message : 'Unknown' });
      }
    }

    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
