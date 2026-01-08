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

interface OptimizeRequest {
  pageId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  targetKeyword?: string;
  language?: string;
  region?: string;
  aiConfig?: AIConfig; // User's AI configuration
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
  };
  cached?: boolean;
  requestId?: string;
  error?: string;
}

const OPTIMIZATION_PROMPT = `You are a WORLD-CLASS content strategist combining the persuasive power of Alex Hormozi, the storytelling of Gary Vee, and the SEO mastery of Brian Dean. Your mission: Transform mediocre content into MAGNETIC, conversion-focused masterpieces that dominate search rankings AND captivate human readers.

## YOUR CONTENT PHILOSOPHY

**The Hormozi Method:**
- Lead with VALUE so massive it feels illegal
- Use pattern interrupts every 2-3 paragraphs (bold statements, questions, stories)
- Make complex ideas stupid simple (8th-grade reading level)
- Every sentence must EARN the next sentence
- No fluff. No filler. Every word carries weight.

**The Human Touch:**
- Write like you TALK to a smart friend
- Use "you" 3x more than "we" or "I"
- Include personal opinions, hot takes, and real experience
- Add humor where appropriate (but never forced)
- Break the 4th wall occasionally

**The SEO/GEO/AEO Excellence:**
- Natural keyword integration (NEVER stuffed)
- Semantic richness with LSI keywords
- Answer featured snippet questions directly
- Optimize for voice search (conversational queries)
- E-E-A-T signals throughout (expertise, experience, authority, trust)

## VISUAL FORMATTING REQUIREMENTS (CRITICAL!)

Create BEAUTIFUL, scannable content with:

1. **Strategic White Space** - Short paragraphs (2-3 sentences MAX)

2. **Visual Hierarchy** - Use this HTML structure:
   - <h1> for main title (only ONE)
   - <h2> for major sections
   - <h3> for subsections
   - Wrap key stats in: <div class="stat-callout"><span class="stat-number">78%</span><span class="stat-label">of users prefer...</span></div>

3. **Highlight Boxes** - For key insights:
   <div class="key-insight">
     <strong>💡 Key Insight:</strong> [Your powerful insight here]
   </div>

4. **Pro Tips** - For actionable advice:
   <div class="pro-tip">
     <strong>🚀 Pro Tip:</strong> [Actionable tip here]
   </div>

5. **Warning Boxes** - For pitfalls:
   <div class="warning-box">
     <strong>⚠️ Watch Out:</strong> [Warning here]
   </div>

6. **Quote Blocks** - For powerful statements:
   <blockquote class="pull-quote">"Your powerful quote here"</blockquote>

7. **Lists That Pop**:
   - Use ✅ for benefits
   - Use ❌ for mistakes
   - Use 👉 for action items
   - Use 💰 for money/value related
   - Use ⏱️ for time-saving tips

8. **Comparison Tables** - When comparing options:
   <table class="comparison-table">
     <thead><tr><th>Feature</th><th>Option A</th><th>Option B</th></tr></thead>
     <tbody>...</tbody>
   </table>

9. **Step-by-Step Sections**:
   <div class="step-box">
     <span class="step-number">1</span>
     <div class="step-content">
       <h4>Step Title</h4>
       <p>Explanation...</p>
     </div>
   </div>

10. **TL;DR Section** at the top:
    <div class="tldr-box">
      <strong>⚡ TL;DR:</strong> [2-3 sentence summary]
    </div>

11. **FAQ Schema** at the end:
    <div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h3 itemprop="name">Question here?</h3>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <p itemprop="text">Answer here.</p>
        </div>
      </div>
    </div>

## CONTENT STRUCTURE (Follow This!)

1. **Hook** (First 50 words) - Pattern interrupt or shocking stat
2. **TL;DR Box** - For the skimmers
3. **The Problem** - Agitate their pain (they should feel it)
4. **The Solution** - Your framework/method
5. **Deep Dive Sections** - H2s with rich content
6. **Actionable Steps** - Numbered, clear, specific
7. **FAQs** - Answer real questions (voice search optimized)
8. **Strong CTA** - Tell them exactly what to do next

## WRITING RULES

✅ DO:
- Use power words: Discover, Unlock, Proven, Secret, Revolutionary
- Include specific numbers: "73.4% increase" not "big increase"
- Add micro-stories (2-3 sentences that illustrate points)
- Use analogies that a 5th grader would understand
- Create open loops that keep them reading
- End sections with a transition hook to the next section

❌ DON'T:
- Use passive voice
- Write paragraphs longer than 3 sentences
- Use jargon without explaining it
- Make claims without backing them up
- Use the same sentence structure twice in a row
- Start sentences with "It is" or "There are"

## OUTPUT FORMAT

Respond ONLY with valid JSON (no markdown wrapper, no explanation):

{
  "optimizedTitle": "Compelling title with keyword (50-60 chars) - use numbers, power words",
  "metaDescription": "Click-worthy description with CTA (155-160 chars) - include benefit + curiosity gap",
  "h1": "Slightly different from title, includes main keyword naturally",
  "h2s": ["Benefit-focused H2 1", "Problem-agitating H2 2", "Solution H2 3", "How-to H2 4", "FAQ H2 5"],
  "optimizedContent": "<div class='tldr-box'>...</div><h1>...</h1><p>Hook paragraph...</p>... [FULL HTML CONTENT - minimum 2000 words]",
  "contentStrategy": {
    "wordCount": 2500,
    "readabilityScore": 72,
    "keywordDensity": 1.1,
    "lsiKeywords": ["semantic keyword 1", "semantic keyword 2", "semantic keyword 3", "semantic keyword 4", "semantic keyword 5"]
  },
  "internalLinks": [
    {"anchor": "benefit-focused anchor text", "target": "/related-post-slug", "position": 350}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Your optimized title",
    "description": "Your meta description",
    "author": {"@type": "Person", "name": "Author Name"},
    "dateModified": "${new Date().toISOString().split('T')[0]}"
  },
  "aiSuggestions": {
    "contentGaps": "Specific missing topics with word count recommendations",
    "quickWins": "3 things to implement in 5 minutes for instant improvement",
    "improvements": ["Specific improvement 1", "Specific improvement 2", "Specific improvement 3"]
  },
  "qualityScore": 88,
  "estimatedRankPosition": 3,
  "confidenceLevel": 0.91
}`;

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
    const { siteUrl, username, applicationPassword, targetKeyword, language, region, aiConfig } = body;

    // Validate required fields
    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword']);

    logger.info('Starting optimization', { 
      pageId, 
      siteUrl, 
      aiProvider: aiConfig?.provider || 'lovable-default',
      aiModel: aiConfig?.model || 'google/gemini-2.5-flash'
    });

    // Rate limiting: 10 optimizations per minute per site
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

    // Determine AI configuration - prefer user's config, fallback to Lovable AI
    const useUserAI = aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model;
    
    if (!useUserAI && !lovableApiKey) {
      throw new AppError('No AI provider configured. Please configure an AI provider or enable Lovable AI.', 'AI_NOT_CONFIGURED', 500);
    }

    logger.info('Using AI provider', { 
      provider: useUserAI ? aiConfig!.provider : 'lovable',
      model: useUserAI ? aiConfig!.model : 'google/gemini-2.5-flash'
    });

    // Idempotency check - use header key or generate from pageId + timestamp (10 second window)
    const idemKey = idempotencyKey || generateIdempotencyKey('optimize', pageId, Math.floor(Date.now() / 10000).toString());
    
    const { result: optimizationResponse, cached } = await withIdempotency<OptimizationResult>(
      idemKey,
      async () => {
        // Update page status to optimizing
        await supabase
          .from('pages')
          .update({ status: 'optimizing' })
          .eq('id', pageId);

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

        // Fetch page content from WordPress
        let normalizedUrl = siteUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
        }
        normalizedUrl = normalizedUrl.replace(/\/+$/, '');

        const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);
        
        let pageContent = '';
        let pageTitle = pageData.title;

        // Try to fetch content if we have a post_id (with retry)
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

        // Build the optimization prompt
        const userPrompt = `
Analyze and optimize this page:

URL: ${pageData.url}
Current Title: ${pageTitle}
Target Keyword: ${targetKeyword || 'auto-detect based on content'}
Language: ${language || 'en'}
Region: ${region || 'global'}
Word Count: ${pageData.word_count || 'unknown'}
${pageContent ? `\nContent Preview (first 3000 chars):\n${pageContent.substring(0, 3000)}` : ''}

Generate comprehensive SEO optimization recommendations.`;

        logger.info('Calling AI for optimization');

        // Build AI request based on provider
        const buildAIRequest = (): { url: string; headers: HeadersInit; body: string } => {
          const messages = [
            { role: 'system', content: OPTIMIZATION_PROMPT },
            { role: 'user', content: userPrompt },
          ];

          // If user has configured their own AI provider, use it
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
                      maxOutputTokens: 4000,
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
                    max_tokens: 4000,
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
                    max_tokens: 4000,
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
                    max_tokens: 4000,
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
                    max_tokens: 4000,
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
              max_tokens: 4000,
            }),
          };
        };

        const aiRequest = buildAIRequest();

        // Call AI with 45 second timeout and retry
        const aiController = new AbortController();
        const aiTimeoutId = setTimeout(() => aiController.abort(), 45000);

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
            logger.error('AI request timeout after 45 seconds');
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            await supabase.from('activity_log').insert({
              page_id: pageId,
              type: 'error',
              message: 'AI request timeout after 45 seconds.',
            });
            throw new AppError('AI request timed out after 45 seconds. Try again.', 'AI_TIMEOUT', 504);
          }
          throw aiErr;
        }

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          logger.error('AI error response', { status: aiResponse.status, body: errorText.substring(0, 500) });
          
          if (aiResponse.status === 429) {
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            throw new AppError('Too many requests. Please try again later.', 'AI_RATE_LIMIT', 429);
          }
          
          if (aiResponse.status === 402) {
            await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
            throw new AppError('Please add credits to your Lovable workspace.', 'CREDITS_REQUIRED', 402);
          }
          
          throw new AppError(`AI request failed: ${aiResponse.status}`, 'AI_ERROR', 500);
        }

        const aiData = await aiResponse.json();
        
        // Extract content based on provider response format
        let aiContent: string | undefined;
        
        if (useUserAI && aiConfig?.provider === 'google') {
          // Google Gemini API format
          aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (useUserAI && aiConfig?.provider === 'anthropic') {
          // Anthropic Claude API format
          aiContent = aiData.content?.[0]?.text;
        } else {
          // OpenAI-compatible format (OpenAI, Groq, OpenRouter, Lovable AI Gateway)
          aiContent = aiData.choices?.[0]?.message?.content;
        }

        if (!aiContent) {
          logger.error('Empty AI response', { provider: aiConfig?.provider || 'lovable', responseKeys: Object.keys(aiData) });
          throw new AppError('No response from AI', 'AI_EMPTY_RESPONSE', 500);
        }

        logger.info('AI response received, parsing');

        // Parse AI response - extract JSON from potential markdown wrapper
        let optimization;
        try {
          let jsonStr = aiContent.trim();
          
          // Remove markdown code blocks (handles ```json, ``` json, ```JSON, etc.)
          const codeBlockMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          } else if (jsonStr.startsWith('```')) {
            // Fallback: just strip ``` from start and end
            jsonStr = jsonStr.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
          }
          
          // Try to find JSON object if there's extra text before/after
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
          
          optimization = JSON.parse(jsonStr);
        } catch (e) {
          logger.error('Failed to parse AI response', { content: aiContent.substring(0, 500), error: e instanceof Error ? e.message : 'Unknown' });
          throw new AppError('Failed to parse AI optimization response', 'AI_PARSE_ERROR', 500);
        }

        // Validate all required fields exist
        const requiredFields = ['optimizedTitle', 'metaDescription', 'h1', 'h2s', 'optimizedContent', 'contentStrategy', 'schema', 'qualityScore'];
        for (const field of requiredFields) {
          if (!optimization[field]) {
            logger.error('AI response missing field', { field });
            throw new AppError(`AI response missing critical field: ${field}`, 'AI_INCOMPLETE_RESPONSE', 500);
          }
        }

        // Validate optimizedContent is not too short
        if (!optimization.optimizedContent || optimization.optimizedContent.trim().length < 100) {
          logger.error('optimizedContent too short', { length: optimization.optimizedContent?.length || 0 });
          throw new AppError(`optimizedContent too short (${optimization.optimizedContent?.length || 0} chars)`, 'AI_CONTENT_TOO_SHORT', 500);
        }

        logger.info('Validated response', { contentLength: optimization.optimizedContent.length });

        // Create job record
        const { data: job, error: jobError } = await supabase
          .from('jobs')
          .insert({
            page_id: pageId,
            status: 'completed',
            current_step: 'optimization_complete',
            progress: 100,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            result: optimization,
            ai_tokens_used: aiData.usage?.total_tokens || 0,
          })
          .select()
          .single();

        if (jobError) {
          logger.error('Failed to create job', { error: jobError.message });
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
            updated_at: new Date().toISOString(),
          })
          .eq('id', pageId);

        // Log activity
        await supabase
          .from('activity_log')
          .insert({
            page_id: pageId,
            job_id: job?.id,
            type: 'success',
            message: `Optimization completed with score ${optimization.qualityScore}`,
            details: {
              qualityScore: optimization.qualityScore,
              estimatedRank: optimization.estimatedRankPosition,
              improvements: optimization.aiSuggestions?.improvements?.length || 0,
              requestId: logger.getRequestId(),
            },
          });

        logger.info('Successfully optimized page', { qualityScore: optimization.qualityScore });

        return {
          success: true,
          message: 'Page optimized successfully',
          optimization,
          requestId: logger.getRequestId(),
        };
      },
      300000 // 5 minute TTL for idempotency
    );

    // If result was cached, log it
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

    // Try to update page status to failed
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
