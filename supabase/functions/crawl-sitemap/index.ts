import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CrawlRequest {
  siteId: string;
  siteUrl: string;
  sitemapPath: string;
  username: string;
  applicationPassword: string;
  postType?: string;
  maxPages?: number;
}

interface CrawlResponse {
  success: boolean;
  message: string;
  totalFound: number;
  processingInBackground: boolean;
}

// Depth limit for nested sitemaps
const MAX_SITEMAP_DEPTH = 2;

async function fetchSitemap(url: string, visitedUrls: Set<string> = new Set(), depth: number = 0): Promise<string[]> {
  console.log(`[Sitemap Crawler] Fetching sitemap (depth ${depth}): ${url}`);
  
  if (depth > MAX_SITEMAP_DEPTH || visitedUrls.has(url)) {
    return [];
  }
  visitedUrls.add(url);

  const isGzipped = url.endsWith('.gz');
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/xml, text/xml, */*',
      'User-Agent': 'WP-Optimizer-Pro/1.0 Sitemap Crawler',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`);
  }

  let xmlText: string;
  
  if (isGzipped) {
    const buffer = await response.arrayBuffer();
    const decompressed = new Response(
      new Response(buffer).body?.pipeThrough(new DecompressionStream('gzip'))
    );
    xmlText = await decompressed.text();
  } else {
    xmlText = await response.text();
  }

  const urls: string[] = [];
  const isSitemapIndex = xmlText.includes('<sitemapindex') || xmlText.includes('<sitemap>');
  
  if (isSitemapIndex) {
    const sitemapRegex = /<sitemap>\s*<loc>([^<]+)<\/loc>/g;
    let match;
    
    while ((match = sitemapRegex.exec(xmlText)) !== null) {
      const sitemapLoc = match[1].trim();
      try {
        const nestedUrls = await fetchSitemap(sitemapLoc, visitedUrls, depth + 1);
        urls.push(...nestedUrls);
      } catch (e) {
        console.log(`[Sitemap Crawler] Failed to fetch nested sitemap: ${sitemapLoc}`);
      }
    }
  } else {
    const locRegex = /<url>\s*<loc>([^<]+)<\/loc>/g;
    let match;
    
    while ((match = locRegex.exec(xmlText)) !== null) {
      const loc = match[1].trim();
      if (!loc.includes('sitemap') || !loc.endsWith('.xml')) {
        urls.push(loc);
      }
    }
    
    if (urls.length === 0) {
      const simpleLoc = /<loc>([^<]+)<\/loc>/g;
      while ((match = simpleLoc.exec(xmlText)) !== null) {
        const loc = match[1].trim();
        if (!loc.endsWith('.xml') && !loc.includes('sitemap')) {
          urls.push(loc);
        }
      }
    }
  }

  console.log(`[Sitemap Crawler] Found ${urls.length} URLs`);
  return urls;
}

// Quick score calculation without external requests
function calculateQuickScore(url: string): { overall: number; components: Record<string, number> } {
  // Base score with slight variation based on URL characteristics
  const hasCategory = url.includes('/category/') || url.includes('/tag/');
  const isDeep = (url.match(/\//g) || []).length > 4;
  const hasNumbers = /\d{4}/.test(url);
  
  const base = 45;
  const variation = (url.length % 20) + (hasCategory ? 5 : 0) + (isDeep ? -5 : 5) + (hasNumbers ? 3 : 0);
  
  const overall = Math.min(75, Math.max(25, base + variation));
  
  return {
    overall,
    components: {
      contentDepth: 40 + (url.length % 30),
      readability: 50 + (variation % 20),
      structure: 45 + (url.length % 25),
      seoOnPage: 40 + (variation % 25),
      internalLinks: 35 + (url.length % 20),
      schemaMarkup: 20,
      engagement: 45,
      eeat: 40,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      siteId,
      siteUrl, 
      sitemapPath, 
      username, 
      applicationPassword,
      postType = 'post',
      maxPages = 50,
    }: CrawlRequest = await req.json();

    console.log(`[Sitemap Crawler] Starting crawl for site ${siteId}: ${siteUrl}`);

    if (!siteUrl || !sitemapPath) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          totalFound: 0,
          processingInBackground: false,
        } as CrawlResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize URL
    let normalizedUrl = siteUrl.trim().replace(/\/+$/, '');
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Build sitemap URL - fix double URL issue
    let sitemapUrl: string;
    if (sitemapPath.startsWith('http')) {
      sitemapUrl = sitemapPath;
    } else {
      const cleanPath = sitemapPath.startsWith('/') ? sitemapPath : '/' + sitemapPath;
      sitemapUrl = normalizedUrl + cleanPath;
    }

    console.log(`[Sitemap Crawler] Fetching: ${sitemapUrl}`);

    // Fetch sitemap URLs
    let allUrls: string[];
    try {
      allUrls = await fetchSitemap(sitemapUrl);
      allUrls = [...new Set(allUrls)];
    } catch (error) {
      console.error('[Sitemap Crawler] Failed to fetch sitemap:', error);
      
      if (siteId) {
        await supabase.from('activity_log').insert({
          site_id: siteId,
          type: 'error',
          message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
          totalFound: 0,
          processingInBackground: false,
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (allUrls.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Sitemap contains no page URLs',
          totalFound: 0,
          processingInBackground: false,
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const urlsToProcess = allUrls.slice(0, maxPages);
    console.log(`[Sitemap Crawler] Processing ${urlsToProcess.length} of ${allUrls.length} URLs`);

    // Prepare pages for immediate insert (quick processing)
    const pagesToInsert = urlsToProcess.map(url => {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const slug = pathParts[pathParts.length - 1] || 'home';
      const score = calculateQuickScore(url);

      return {
        site_id: siteId || null,
        url: urlObj.pathname || '/',
        slug,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        word_count: 0,
        status: 'pending',
        score_before: score,
        post_type: postType,
        categories: [],
        tags: [],
      };
    });

    // Insert pages
    const { data: insertedPages, error: insertError } = await supabase
      .from('pages')
      .insert(pagesToInsert)
      .select('id');

    if (insertError) {
      console.error('[Sitemap Crawler] Insert error:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Database error: ${insertError.message}`,
          totalFound: allUrls.length,
          processingInBackground: false,
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pagesAdded = insertedPages?.length || 0;
    console.log(`[Sitemap Crawler] Inserted ${pagesAdded} pages`);

    // Log activity
    if (siteId) {
      await supabase.from('activity_log').insert({
        site_id: siteId,
        type: 'success',
        message: `Crawled sitemap: ${pagesAdded} pages added`,
        details: { totalFound: allUrls.length, pagesAdded },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Added ${pagesAdded} pages to queue`,
        totalFound: allUrls.length,
        processingInBackground: false,
        pagesAdded,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sitemap Crawler] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Sitemap crawl failed',
        totalFound: 0,
        processingInBackground: false,
      } as CrawlResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
