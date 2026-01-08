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
  excludeOptimized?: boolean;
  lowScoreOnly?: boolean;
}

interface PageInfo {
  id: string;
  url: string;
  slug: string;
  title: string;
  postId?: number;
  postType: string;
  lastmod?: string;
  wordCount: number;
  categories: string[];
  tags: string[];
  featuredImage?: string;
  scoreBefore?: {
    overall: number;
    components: Record<string, number>;
  };
}

interface CrawlResponse {
  success: boolean;
  message: string;
  pagesAdded: number;
  totalFound: number;
  errors: string[];
}

// Depth limit for nested sitemaps to prevent infinite recursion
const MAX_SITEMAP_DEPTH = 3;

async function fetchSitemap(url: string, visitedUrls: Set<string> = new Set(), depth: number = 0): Promise<string[]> {
  console.log(`[Sitemap Crawler] Fetching sitemap (depth ${depth}): ${url}`);
  
  if (depth > MAX_SITEMAP_DEPTH) {
    console.log(`[Sitemap Crawler] Max depth reached, skipping: ${url}`);
    return [];
  }
  
  if (visitedUrls.has(url)) {
    console.log(`[Sitemap Crawler] Already visited, skipping: ${url}`);
    return [];
  }
  visitedUrls.add(url);

  const isGzipped = url.endsWith('.gz');
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Encoding': isGzipped ? 'gzip' : 'identity',
      'User-Agent': 'WP-Optimizer-Pro/1.0 Sitemap Crawler',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
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
      console.log(`[Sitemap Crawler] Found nested sitemap: ${sitemapLoc}`);
      try {
        const nestedUrls = await fetchSitemap(sitemapLoc, visitedUrls, depth + 1);
        urls.push(...nestedUrls);
      } catch (e) {
        console.log(`[Sitemap Crawler] Failed to fetch nested sitemap: ${sitemapLoc}`, e);
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

  console.log(`[Sitemap Crawler] Found ${urls.length} URLs in sitemap`);
  return urls;
}

async function fetchWordPressPostInfo(
  baseUrl: string,
  pageUrl: string,
  authHeader: string,
  postType: string
): Promise<Partial<PageInfo> | null> {
  try {
    const urlObj = new URL(pageUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || '';
    
    if (!slug) return null;

    const endpoints = postType === 'page' 
      ? ['pages'] 
      : postType === 'post' 
      ? ['posts'] 
      : [postType, 'posts', 'pages'];
    
    for (const endpoint of endpoints) {
      const searchUrl = `${baseUrl}/wp-json/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&_embed`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
      });

      if (!response.ok) continue;

      const posts = await response.json();
      if (!posts || posts.length === 0) continue;

      const post = posts[0];
      const plainText = post.content?.rendered?.replace(/<[^>]*>/g, ' ') || '';
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;

      const categories: string[] = [];
      const tags: string[] = [];
      
      if (post._embedded) {
        const wpTerms = post._embedded['wp:term'] || [];
        wpTerms.forEach((termArray: any[]) => {
          termArray?.forEach((term: any) => {
            if (term.taxonomy === 'category') {
              categories.push(term.name);
            } else if (term.taxonomy === 'post_tag') {
              tags.push(term.name);
            }
          });
        });
      }

      let featuredImage: string | undefined;
      if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
        featuredImage = post._embedded['wp:featuredmedia'][0].source_url;
      }

      return {
        postId: post.id,
        title: post.title?.rendered || slug,
        wordCount,
        categories,
        tags,
        featuredImage,
      };
    }

    return null;
  } catch (error) {
    console.error(`[Sitemap Crawler] Error fetching post info for ${pageUrl}:`, error);
    return null;
  }
}

async function fetchPageContent(url: string): Promise<{ wordCount: number; hasH1: boolean; hasH2: boolean; hasSchema: boolean }> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'WP-Optimizer-Pro/1.0',
      },
    });

    if (!response.ok) {
      return { wordCount: 0, hasH1: false, hasH2: false, hasSchema: false };
    }

    const html = await response.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    
    const plainText = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const hasH1 = /<h1[^>]*>/i.test(html);
    const hasH2 = /<h2[^>]*>/i.test(html);
    const hasSchema = /application\/ld\+json/i.test(html);

    return { wordCount, hasH1, hasH2, hasSchema };
  } catch (error) {
    console.error(`[Sitemap Crawler] Error fetching page content for ${url}:`, error);
    return { wordCount: 0, hasH1: false, hasH2: false, hasSchema: false };
  }
}

function calculateDeterministicScore(
  wordCount: number,
  hasH1: boolean,
  hasH2: boolean,
  hasSchema: boolean,
  hasCategories: boolean,
  hasTags: boolean,
  hasFeaturedImage: boolean
): { overall: number; components: Record<string, number> } {
  let contentDepth = 0;
  if (wordCount >= 2500) contentDepth = 100;
  else if (wordCount >= 1500) contentDepth = 80 + ((wordCount - 1500) / 1000) * 20;
  else if (wordCount >= 800) contentDepth = 50 + ((wordCount - 800) / 700) * 30;
  else if (wordCount >= 300) contentDepth = 20 + ((wordCount - 300) / 500) * 30;
  else contentDepth = (wordCount / 300) * 20;

  const readability = wordCount > 100 ? 70 : 30;

  let structure = 30;
  if (hasH1) structure += 30;
  if (hasH2) structure += 40;

  let seoOnPage = 40;
  if (hasCategories) seoOnPage += 20;
  if (hasTags) seoOnPage += 20;
  if (hasFeaturedImage) seoOnPage += 20;

  const schemaMarkup = hasSchema ? 80 : 10;
  const internalLinks = 40;
  const engagement = 50;
  const eeat = 40;

  const overall = Math.floor(
    contentDepth * 0.20 +
    readability * 0.10 +
    structure * 0.15 +
    seoOnPage * 0.15 +
    internalLinks * 0.15 +
    schemaMarkup * 0.10 +
    engagement * 0.10 +
    eeat * 0.05
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    components: {
      contentDepth: Math.floor(contentDepth),
      readability: Math.floor(readability),
      structure: Math.floor(structure),
      seoOnPage: Math.floor(seoOnPage),
      internalLinks: Math.floor(internalLinks),
      schemaMarkup: Math.floor(schemaMarkup),
      engagement: Math.floor(engagement),
      eeat: Math.floor(eeat),
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
      maxPages = 100,
    }: CrawlRequest = await req.json();

    console.log(`[Sitemap Crawler] Starting crawl for site ${siteId}: ${siteUrl}${sitemapPath}`);

    // Validate inputs
    if (!siteUrl || !sitemapPath) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: siteUrl and sitemapPath are required',
          pagesAdded: 0,
          totalFound: 0,
          errors: ['siteUrl and sitemapPath are required'],
        } as CrawlResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize URL
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    // Build sitemap URL
    const sitemapUrl = sitemapPath.startsWith('http') 
      ? sitemapPath 
      : `${normalizedUrl}${sitemapPath.startsWith('/') ? '' : '/'}${sitemapPath}`;

    // Fetch sitemap
    let allUrls: string[];
    try {
      allUrls = await fetchSitemap(sitemapUrl);
      allUrls = [...new Set(allUrls)];
    } catch (error) {
      console.error('[Sitemap Crawler] Failed to fetch sitemap:', error);
      
      // Log error to activity_log
      if (siteId) {
        await supabase.from('activity_log').insert({
          site_id: siteId,
          type: 'error',
          message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { sitemapUrl },
        });
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
          pagesAdded: 0,
          totalFound: 0,
          errors: [error instanceof Error ? error.message : 'Failed to fetch sitemap'],
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (allUrls.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Sitemap is accessible but contains no page URLs',
          pagesAdded: 0,
          totalFound: 0,
          errors: [],
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const filteredUrls = allUrls.slice(0, maxPages);
    console.log(`[Sitemap Crawler] Processing ${filteredUrls.length} URLs (max: ${maxPages}, total found: ${allUrls.length})`);

    const authHeader = username && applicationPassword 
      ? 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`)
      : '';

    // Process URLs and prepare for database insert
    const pagesToInsert: any[] = [];
    const errors: string[] = [];

    for (const url of filteredUrls) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const slug = pathParts[pathParts.length - 1] || urlObj.pathname.replace(/\//g, '') || 'home';

        let postInfo: Partial<PageInfo> | null = null;
        if (authHeader) {
          postInfo = await fetchWordPressPostInfo(normalizedUrl, url, authHeader, postType);
        }

        let pageAnalysis = { wordCount: 0, hasH1: false, hasH2: false, hasSchema: false };
        if (!postInfo?.wordCount) {
          pageAnalysis = await fetchPageContent(url);
        }

        const wordCount = postInfo?.wordCount || pageAnalysis.wordCount;
        const score = calculateDeterministicScore(
          wordCount,
          pageAnalysis.hasH1,
          pageAnalysis.hasH2,
          pageAnalysis.hasSchema,
          (postInfo?.categories?.length || 0) > 0,
          (postInfo?.tags?.length || 0) > 0,
          !!postInfo?.featuredImage
        );

        pagesToInsert.push({
          site_id: siteId || null,
          url: urlObj.pathname || '/',
          slug,
          title: postInfo?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          word_count: wordCount,
          status: 'pending',
          score_before: score,
          post_id: postInfo?.postId || null,
          post_type: postType,
          categories: postInfo?.categories || [],
          tags: postInfo?.tags || [],
          featured_image: postInfo?.featuredImage || null,
        });
      } catch (e) {
        const errorMsg = `Failed to process URL: ${url}`;
        console.error(`[Sitemap Crawler] ${errorMsg}:`, e);
        errors.push(errorMsg);
      }
    }

    // Batch insert pages into database
    let pagesAdded = 0;
    if (pagesToInsert.length > 0) {
      const { data: insertedPages, error: insertError } = await supabase
        .from('pages')
        .insert(pagesToInsert)
        .select();

      if (insertError) {
        console.error('[Sitemap Crawler] Database insert error:', insertError);
        errors.push(`Database error: ${insertError.message}`);
      } else {
        pagesAdded = insertedPages?.length || 0;
        console.log(`[Sitemap Crawler] Inserted ${pagesAdded} pages into database`);
      }
    }

    // Log activity
    if (siteId) {
      await supabase.from('activity_log').insert({
        site_id: siteId,
        type: 'success',
        message: `Crawled sitemap: ${pagesAdded} pages added`,
        details: { 
          sitemapUrl, 
          totalFound: allUrls.length, 
          pagesAdded,
          errors: errors.length,
        },
      });
    }

    console.log(`[Sitemap Crawler] Successfully processed ${pagesAdded} pages with ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully crawled sitemap and added ${pagesAdded} pages to queue`,
        pagesAdded,
        totalFound: allUrls.length,
        errors,
      } as CrawlResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sitemap Crawler] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Sitemap crawl failed',
        pagesAdded: 0,
        totalFound: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      } as CrawlResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
