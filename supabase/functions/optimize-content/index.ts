import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizeRequest {
  pageId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  targetKeyword?: string;
  language?: string;
  region?: string;
}

interface OptimizationResult {
  success: boolean;
  message: string;
  optimization?: {
    optimizedTitle: string;
    metaDescription: string;
    h1: string;
    h2s: string[];
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
  error?: string;
}

const OPTIMIZATION_PROMPT = `You are an elite SEO content optimization AI. Analyze the provided content and generate comprehensive optimization recommendations.

Your task is to:
1. Analyze the current content for SEO weaknesses
2. Generate an optimized title (50-60 chars) with main keyword
3. Create a compelling meta description (155-160 chars) with high CTR potential
4. Suggest an H1 and 3-5 H2 subheadings
5. Identify LSI (Latent Semantic Indexing) keywords
6. Suggest internal linking opportunities
7. Generate schema markup recommendations
8. Provide actionable content improvement suggestions
9. Calculate a quality score (0-100)

Respond ONLY with a valid JSON object (no markdown, no explanation) in this exact format:
{
  "optimizedTitle": "SEO-optimized title here",
  "metaDescription": "Compelling meta description here",
  "h1": "Primary heading with main keyword",
  "h2s": ["Subheading 1", "Subheading 2", "Subheading 3"],
  "contentStrategy": {
    "wordCount": 2500,
    "readabilityScore": 65,
    "keywordDensity": 1.2,
    "lsiKeywords": ["keyword1", "keyword2", "keyword3"]
  },
  "internalLinks": [
    {"anchor": "contextual link text", "target": "/suggested-internal-url", "position": 350}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "title here"
  },
  "aiSuggestions": {
    "contentGaps": "Add 400 words on [specific topic]",
    "quickWins": "Update date, add freshness markers, improve intro",
    "improvements": ["Add FAQ section", "Include statistics", "Add expert quotes"]
  },
  "qualityScore": 85,
  "estimatedRankPosition": 5,
  "confidenceLevel": 0.88
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { pageId, siteUrl, username, applicationPassword, targetKeyword, language, region }: OptimizeRequest = await req.json();

    console.log(`[Optimize] Starting optimization for page: ${pageId}`);

    if (!pageId || !siteUrl || !username || !applicationPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          error: 'pageId, siteUrl, username, and applicationPassword are required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'AI not configured',
          error: 'LOVABLE_API_KEY is not configured. Please enable Lovable AI.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      throw new Error('Page not found in database');
    }

    console.log(`[Optimize] Fetching content for: ${pageData.url}`);

    // Fetch page content from WordPress
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);
    
    let pageContent = '';
    let pageTitle = pageData.title;

    // Try to fetch content if we have a post_id
    if (pageData.post_id) {
      try {
        const wpResponse = await fetch(
          `${normalizedUrl}/wp-json/wp/v2/posts/${pageData.post_id}?context=edit`,
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
              'User-Agent': 'WP-Optimizer-Pro/1.0',
            },
          }
        );

        if (wpResponse.ok) {
          const wpData = await wpResponse.json();
          pageContent = wpData.content?.raw || wpData.content?.rendered || '';
          pageTitle = wpData.title?.raw || wpData.title?.rendered || pageTitle;
          console.log(`[Optimize] Fetched content: ${pageContent.length} chars`);
        }
      } catch (e) {
        console.log(`[Optimize] Could not fetch WP content, using page URL for analysis`);
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

    console.log(`[Optimize] Calling AI for optimization...`);

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: OPTIMIZATION_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[Optimize] AI error: ${aiResponse.status} - ${errorText}`);
      
      if (aiResponse.status === 429) {
        await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
        return new Response(
          JSON.stringify({ success: false, message: 'Rate limit exceeded', error: 'Too many requests. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
        return new Response(
          JSON.stringify({ success: false, message: 'Credits required', error: 'Please add credits to your Lovable workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No response from AI');
    }

    console.log(`[Optimize] AI response received, parsing...`);

    // Parse AI response - extract JSON from potential markdown wrapper
    let optimization;
    try {
      let jsonStr = aiContent.trim();
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      optimization = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[Optimize] Failed to parse AI response:', aiContent);
      throw new Error('Failed to parse AI optimization response');
    }

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
      console.error('[Optimize] Failed to create job:', jobError);
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
        },
      });

    console.log(`[Optimize] Successfully optimized page: ${pageId} (score: ${optimization.qualityScore})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Page optimized successfully',
        optimization,
      } as OptimizationResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Optimize] Error:', error);

    // Try to update page status to failed
    try {
      const { pageId } = await req.clone().json();
      if (pageId) {
        await supabase
          .from('pages')
          .update({ status: 'failed' })
          .eq('id', pageId);

        await supabase
          .from('activity_log')
          .insert({
            page_id: pageId,
            type: 'error',
            message: `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
      }
    } catch (e) {
      console.error('[Optimize] Failed to update error status:', e);
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Optimization failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as OptimizationResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
