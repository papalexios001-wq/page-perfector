import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SerpRequest {
  query: string;
  gl?: string; // Country code (e.g., 'us', 'uk')
  hl?: string; // Language code (e.g., 'en', 'es')
  serperApiKey: string;
}

interface OrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface PeopleAlsoAsk {
  question: string;
  snippet: string;
  link: string;
}

interface SerpResult {
  success: boolean;
  query: string;
  organic: OrganicResult[];
  peopleAlsoAsk: PeopleAlsoAsk[];
  relatedSearches: string[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
  cached: boolean;
  error?: string;
}

const CACHE_TTL_DAYS = 7;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { query, gl = 'us', hl = 'en', serperApiKey }: SerpRequest = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!serperApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Serper API key is required. Add it in Configuration → AI Provider.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SERP] Analyzing: "${query}" (gl=${gl}, hl=${hl})`);

    // Check cache first
    const { data: cached } = await supabase
      .from('serp_cache')
      .select('result')
      .eq('query', query.toLowerCase().trim())
      .eq('gl', gl)
      .eq('hl', hl)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached?.result) {
      console.log(`[SERP] Cache hit for: "${query}"`);
      return new Response(
        JSON.stringify({
          ...cached.result,
          cached: true,
        } as SerpResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SERP] Cache miss, calling Serper API...`);

    // Call Serper API
    const serperResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl,
        hl,
        num: 10,
      }),
    });

    if (!serperResponse.ok) {
      const errorText = await serperResponse.text();
      console.error(`[SERP] Serper API error: ${serperResponse.status} - ${errorText}`);
      
      if (serperResponse.status === 401 || serperResponse.status === 403) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid Serper API key. Please check your key in Configuration.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `Serper API error: ${serperResponse.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serperData = await serperResponse.json();

    // Parse organic results
    const organic: OrganicResult[] = (serperData.organic || []).slice(0, 10).map((item: any, index: number) => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      position: index + 1,
    }));

    // Parse People Also Ask
    const peopleAlsoAsk: PeopleAlsoAsk[] = (serperData.peopleAlsoAsk || []).map((item: any) => ({
      question: item.question || '',
      snippet: item.snippet || '',
      link: item.link || '',
    }));

    // Parse Related Searches
    const relatedSearches: string[] = (serperData.relatedSearches || []).map((item: any) => item.query || '');

    const result: SerpResult = {
      success: true,
      query,
      organic,
      peopleAlsoAsk,
      relatedSearches,
      searchParameters: { q: query, gl, hl },
      cached: false,
    };

    // Cache the result
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

    await supabase
      .from('serp_cache')
      .upsert({
        query: query.toLowerCase().trim(),
        gl,
        hl,
        result,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'query,gl,hl',
      });

    console.log(`[SERP] Successfully analyzed: "${query}" (${organic.length} organic, ${peopleAlsoAsk.length} PAA)`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SERP] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
