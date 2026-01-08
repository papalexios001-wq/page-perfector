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

// Simplified prompt to prevent truncation with free/limited models
const OPTIMIZATION_PROMPT = `You are an expert SEO content writer with Alex Hormozi's persuasive style. Transform content into engaging, high-converting articles.

WRITING STYLE:
- Short paragraphs (2-3 sentences max)
- Use "you" frequently, write conversationally
- Include specific numbers and stats
- Add power words: Discover, Proven, Secret, Revolutionary
- Make it scannable with bullet points and headers

CONTENT FORMAT:
- Start with a hook (shocking stat or bold statement)
- Add TL;DR summary box at top
- Use H2s for major sections, H3s for subsections
- Include actionable tips in highlight boxes
- End with clear CTA and 3-5 FAQs

HTML ELEMENTS TO USE (IMPORTANT: use SINGLE quotes for attributes):
<div class='tldr-box'><strong>TL;DR:</strong> [summary]</div>
<div class='key-insight'><strong>Key Insight:</strong> [insight]</div>
<div class='pro-tip'><strong>Pro Tip:</strong> [tip]</div>
<div class='warning-box'><strong>Watch Out:</strong> [warning]</div>
<blockquote class='pull-quote'>[quote]</blockquote>

Use ✅ for benefits, ❌ for mistakes, 👉 for actions in lists.

CRITICAL JSON RULES:
- Return ONLY valid JSON (no markdown, no explanation).
- "optimizedContent" MUST be a single JSON string.
- Do NOT include any unescaped double quotes (") inside optimizedContent.
  - Use single quotes for HTML attributes.
  - If you need quotation marks in text, use &quot; instead.
- Do NOT include literal newlines inside optimizedContent. Use \n if needed.

OUTPUT JSON SCHEMA:
{
  "optimizedTitle": "60 char max title with keyword",
  "metaDescription": "155 char description with CTA",
  "h1": "Main heading with keyword",
  "h2s": ["Section 1", "Section 2", "Section 3"],
  "optimizedContent": "<div class='tldr-box'>...</div><h2>...</h2><p>...</p>...",
  "contentStrategy": {"wordCount": 1500, "readabilityScore": 75, "keywordDensity": 1.2, "lsiKeywords": ["kw1", "kw2"]},
  "internalLinks": [{"anchor": "text", "target": "/slug", "position": 100}],
  "schema": {"@context": "https://schema.org", "@type": "Article", "headline": "title"},
  "aiSuggestions": {"contentGaps": "gaps", "quickWins": "wins", "improvements": ["imp1", "imp2"]},
  "qualityScore": 85,
  "estimatedRankPosition": 5,
  "confidenceLevel": 0.85
}`;

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

  // 2) Repair a common failure mode: unescaped double quotes in HTML attributes
  //    Example: <div class="tldr-box"> breaks JSON unless escaped
  s = s.replace(/="([^"]*)"/g, "='$1'");

  // 3) Escape literal newlines that appear inside quoted JSON strings
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
                      maxOutputTokens: 24000,
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
                    max_tokens: 24000,
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
                    max_tokens: 24000,
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
                    max_tokens: 24000,
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
                    max_tokens: 24000,
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
              max_tokens: 24000,
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

          jsonStr = repairJsonStringForParsing(jsonStr);
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
