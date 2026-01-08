import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NEURONWRITER_API = 'https://app.neuronwriter.com/neuron-api/0.5/writer';

interface NeuronWriterRequest {
  action: 'list-projects' | 'list-queries' | 'get-query' | 'new-query' | 'get-recommendations';
  apiKey: string;
  projectId?: string;
  queryId?: string;
  keyword?: string;
  engine?: string;
  language?: string;
  url?: string;
}

interface NeuronProject {
  project: string;
  name: string;
  language: string;
  engine: string;
}

interface NeuronQuery {
  query: string;
  keyword: string;
  language: string;
  engine: string;
  created: string;
  updated: string;
  status: string;
}

interface NeuronRecommendations {
  status: string;
  metrics?: {
    word_count: { median: number; target: number };
    readability?: { median: number; target: number };
  };
  terms_txt?: {
    title: string;
    desc_title?: string;
    h1: string;
    h2?: string;
    content_basic: string;
    content_basic_w_ranges?: string;
    content_extended?: string;
    entities: string;
  };
  terms?: {
    title: Array<{ t: string; usage_pc: number }>;
    desc?: Array<{ t: string; usage_pc: number }>;
    h1?: Array<{ t: string; usage_pc: number }>;
    h2?: Array<{ t: string; usage_pc: number }>;
    content_basic: Array<{ t: string; usage_pc: number; sugg_usage?: [number, number] }>;
    content_extended?: Array<{ t: string; usage_pc: number; sugg_usage?: [number, number] }>;
    entities?: Array<{ t: string; importance: number; relevance: number; confidence: number; links?: string[][] }>;
  };
  ideas?: {
    suggest_questions: Array<{ q: string }>;
    people_also_ask: Array<{ q: string }>;
    content_questions: Array<{ q: string }>;
  };
  competitors?: Array<{
    rank: number;
    url: string;
    title: string;
    desc?: string;
    content_score?: number;
  }>;
}

async function fetchNeuronWriter(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown> = {}
): Promise<{ data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${NEURONWRITER_API}${endpoint}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NeuronWriter API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        return { error: 'Invalid NeuronWriter API key. Please check your credentials.' };
      }
      if (response.status === 429) {
        return { error: 'NeuronWriter rate limit exceeded. Please try again later.' };
      }
      return { error: `NeuronWriter API error: ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    console.error('NeuronWriter fetch error:', err);
    return { error: err instanceof Error ? err.message : 'Network error connecting to NeuronWriter' };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: NeuronWriterRequest = await req.json();
    const { action, apiKey, projectId, queryId, keyword, engine, language, url } = request;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'NeuronWriter API key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[NeuronWriter] Action: ${action}`);

    switch (action) {
      case 'list-projects': {
        const result = await fetchNeuronWriter('/list-projects', apiKey);
        if (result.error) {
          return new Response(
            JSON.stringify({ error: result.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, projects: result.data as NeuronProject[] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-queries': {
        if (!projectId) {
          return new Response(
            JSON.stringify({ error: 'Project ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await fetchNeuronWriter('/list-queries', apiKey, {
          project: projectId,
          status: 'ready',
        });
        if (result.error) {
          return new Response(
            JSON.stringify({ error: result.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, queries: result.data as NeuronQuery[] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-query': {
        if (!queryId) {
          return new Response(
            JSON.stringify({ error: 'Query ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await fetchNeuronWriter('/get-query', apiKey, { query: queryId });
        if (result.error) {
          return new Response(
            JSON.stringify({ error: result.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const recommendations = result.data as NeuronRecommendations;
        return new Response(
          JSON.stringify({ success: true, recommendations }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'new-query': {
        if (!projectId || !keyword) {
          return new Response(
            JSON.stringify({ error: 'Project ID and keyword are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await fetchNeuronWriter('/new-query', apiKey, {
          project: projectId,
          keyword,
          engine: engine || 'google.com',
          language: language || 'English',
        });
        if (result.error) {
          return new Response(
            JSON.stringify({ error: result.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, query: result.data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-recommendations': {
        // This is a compound action: find or create a query for a URL/keyword, then get recommendations
        if (!projectId) {
          return new Response(
            JSON.stringify({ error: 'Project ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const searchKeyword = keyword || '';
        
        // First, try to find an existing query for this keyword
        const listResult = await fetchNeuronWriter('/list-queries', apiKey, {
          project: projectId,
          status: 'ready',
          keyword: searchKeyword,
        });

        let targetQueryId: string | null = null;

        if (listResult.data && Array.isArray(listResult.data) && listResult.data.length > 0) {
          // Find exact match or closest match
          const queries = listResult.data as NeuronQuery[];
          const exactMatch = queries.find(q => 
            q.keyword.toLowerCase() === searchKeyword.toLowerCase()
          );
          if (exactMatch) {
            targetQueryId = exactMatch.query;
            console.log(`[NeuronWriter] Found existing query: ${targetQueryId}`);
          }
        }

        // If no existing query, create a new one
        if (!targetQueryId && searchKeyword) {
          console.log(`[NeuronWriter] Creating new query for keyword: ${searchKeyword}`);
          const newQueryResult = await fetchNeuronWriter('/new-query', apiKey, {
            project: projectId,
            keyword: searchKeyword,
            engine: engine || 'google.com',
            language: language || 'English',
          });

          if (newQueryResult.error) {
            return new Response(
              JSON.stringify({ error: newQueryResult.error }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const newQuery = newQueryResult.data as { query: string };
          targetQueryId = newQuery.query;
          
          // Wait for the query to be processed (NeuronWriter needs ~60 seconds)
          // We'll return the query ID and let the client poll
          return new Response(
            JSON.stringify({ 
              success: true, 
              status: 'processing',
              queryId: targetQueryId,
              message: 'NeuronWriter is analyzing your keyword. This typically takes 60-90 seconds.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!targetQueryId) {
          return new Response(
            JSON.stringify({ error: 'No query found and no keyword provided to create one' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the recommendations
        const recResult = await fetchNeuronWriter('/get-query', apiKey, { query: targetQueryId });
        if (recResult.error) {
          return new Response(
            JSON.stringify({ error: recResult.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const recommendations = recResult.data as NeuronRecommendations;
        
        if (recommendations.status !== 'ready') {
          return new Response(
            JSON.stringify({ 
              success: true, 
              status: recommendations.status,
              queryId: targetQueryId,
              message: `Query status: ${recommendations.status}. Please wait...`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Format recommendations for SEO optimization
        const formattedRecommendations = {
          success: true,
          status: 'ready',
          queryId: targetQueryId,
          targetWordCount: recommendations.metrics?.word_count?.target || 1500,
          readabilityTarget: recommendations.metrics?.readability?.target || 50,
          
          // Title terms
          titleTerms: recommendations.terms_txt?.title || '',
          
          // H1 terms
          h1Terms: recommendations.terms_txt?.h1 || '',
          
          // H2 terms
          h2Terms: recommendations.terms_txt?.h2 || '',
          
          // Content terms with usage ranges
          contentTerms: recommendations.terms_txt?.content_basic_w_ranges || recommendations.terms_txt?.content_basic || '',
          
          // Extended content terms
          extendedTerms: recommendations.terms_txt?.content_extended || '',
          
          // Entities
          entities: recommendations.terms_txt?.entities || '',
          
          // Detailed terms with percentages
          termsDetailed: {
            title: recommendations.terms?.title || [],
            content: recommendations.terms?.content_basic || [],
            entities: recommendations.terms?.entities || [],
          },
          
          // Questions for FAQ sections
          questions: {
            suggested: (recommendations.ideas?.suggest_questions || []).slice(0, 10).map(q => q.q),
            peopleAlsoAsk: (recommendations.ideas?.people_also_ask || []).slice(0, 10).map(q => q.q),
            contentQuestions: (recommendations.ideas?.content_questions || []).slice(0, 10).map(q => q.q),
          },
          
          // Top competitors
          competitors: (recommendations.competitors || []).slice(0, 5).map(c => ({
            rank: c.rank,
            url: c.url,
            title: c.title,
            score: c.content_score,
          })),
        };

        return new Response(
          JSON.stringify(formattedRecommendations),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (err) {
    console.error('[NeuronWriter] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
