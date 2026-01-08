import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CrawlRequest {
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
  pages: PageInfo[];
  totalFound: number;
  errors: string[];
}

// Depth limit for nested sitemaps to prevent infinite recursion
const MAX_SITEMAP_DEPTH = 3;

async function fetchSitemap(url: string, visitedUrls: Set<string> = new Set(), depth: number = 0): Promise<string[]> {
  console.log(`[Sitemap Crawler] Fetching sitemap (depth ${depth}): ${url}`);
  
  // Prevent infinite loops
  if (depth > MAX_SITEMAP_DEPTH) {
    console.log(`[Sitemap Crawler] Max depth reached, skipping: ${url}`);
    return [];
  }
  
  if (visitedUrls.has(url)) {
    console.log(`[Sitemap Crawler] Already visited, skipping: ${url}`);
    return [];
  }
  visitedUrls.add(url);

  // Handle .gz compressed sitemaps
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
    // Decompress gzipped content
    const buffer = await response.arrayBuffer();
    const decompressed = new Response(
      new Response(buffer).body?.pipeThrough(new DecompressionStream('gzip'))
    );
    xmlText = await decompressed.text();
  } else {
    xmlText = await response.text();
  }

  const urls: string[] = [];
  
  // Check if this is a sitemapindex (contains other sitemaps)
  const isSitemapIndex = xmlText.includes('<sitemapindex') || xmlText.includes('<sitemap>');
  
  if (isSitemapIndex) {
    // Extract sitemap locations from sitemapindex
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
    // Extract page URLs from urlset
    const locRegex = /<url>\s*<loc>([^<]+)<\/loc>/g;
    let match;
    
    while ((match = locRegex.exec(xmlText)) !== null) {
      const loc = match[1].trim();
      // Skip sitemap files
      if (!loc.includes('sitemap') || !loc.endsWith('.xml')) {
        urls.push(loc);
      }
    }
    
    // Fallback: simple loc extraction if no <url> wrappers
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
    // Extract slug from URL
    const urlObj = new URL(pageUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || '';
    
    if (!slug) return null;

    // Try custom post type first, then fall back to standard endpoints
    const endpoints = postType === 'page' 
      ? ['pages'] 
      : postType === 'post' 
      ? ['posts'] 
      : [postType, 'posts', 'pages'];
    
    for (const endpoint of endpoints) {
      const searchUrl = `${baseUrl}/wp-json/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&_embed`;
      
      console.log(`[Sitemap Crawler] Trying endpoint: ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
      });

      if (!response.ok) {
        console.log(`[Sitemap Crawler] Endpoint ${endpoint} returned ${response.status}`);
        continue;
      }

      const posts = await response.json();
      if (!posts || posts.length === 0) continue;

      const post = posts[0];
      
      // Count words in content
      const plainText = post.content?.rendered?.replace(/<[^>]*>/g, ' ') || '';
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;

      // Extract categories and tags
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

      // Get featured image
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

// Fetch page content directly if WP API fails
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
    
    // Extract body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    
    // Strip tags and count words
    const plainText = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    
    // Check for structural elements
    const hasH1 = /<h1[^>]*>/i.test(html);
    const hasH2 = /<h2[^>]*>/i.test(html);
    const hasSchema = /application\/ld\+json/i.test(html);

    return { wordCount, hasH1, hasH2, hasSchema };
  } catch (error) {
    console.error(`[Sitemap Crawler] Error fetching page content for ${url}:`, error);
    return { wordCount: 0, hasH1: false, hasH2: false, hasSchema: false };
  }
}

// Deterministic scoring based on real content analysis
function calculateDeterministicScore(
  wordCount: number,
  hasH1: boolean,
  hasH2: boolean,
  hasSchema: boolean,
  hasCategories: boolean,
  hasTags: boolean,
  hasFeaturedImage: boolean
): { overall: number; components: Record<string, number> } {
  // Content depth: 0-100 based on word count (ideal: 1500-3000 words)
  let contentDepth = 0;
  if (wordCount >= 2500) contentDepth = 100;
  else if (wordCount >= 1500) contentDepth = 80 + ((wordCount - 1500) / 1000) * 20;
  else if (wordCount >= 800) contentDepth = 50 + ((wordCount - 800) / 700) * 30;
  else if (wordCount >= 300) contentDepth = 20 + ((wordCount - 300) / 500) * 30;
  else contentDepth = (wordCount / 300) * 20;

  // Readability: based on content presence
  const readability = wordCount > 100 ? 70 : 30;

  // Structure: based on heading usage
  let structure = 30;
  if (hasH1) structure += 30;
  if (hasH2) structure += 40;

  // SEO on-page: metadata and categorization
  let seoOnPage = 40;
  if (hasCategories) seoOnPage += 20;
  if (hasTags) seoOnPage += 20;
  if (hasFeaturedImage) seoOnPage += 20;

  // Schema markup
  const schemaMarkup = hasSchema ? 80 : 10;

  // Internal links: baseline (would need actual link analysis)
  const internalLinks = 40;

  // Engagement/EEAT: baseline
  const engagement = 50;
  const eeat = 40;

  // Weighted overall score
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
      siteUrl, 
      sitemapPath, 
      username, 
      applicationPassword,
      postType = 'post',
      maxPages = 100,
    }: CrawlRequest = await req.json();

    console.log(`[Sitemap Crawler] Starting crawl for: ${siteUrl}${sitemapPath}`);

    // Validate inputs
    if (!siteUrl || !sitemapPath) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: siteUrl and sitemapPath are required',
          pages: [],
          totalFound: 0,
          errors: ['siteUrl and sitemapPath are required'],
        } as CrawlResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Fetch sitemap with proper handling
    let allUrls: string[];
    try {
      allUrls = await fetchSitemap(sitemapUrl);
      
      // De-duplicate URLs
      allUrls = [...new Set(allUrls)];
    } catch (error) {
      console.error('[Sitemap Crawler] Failed to fetch sitemap:', error);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
          pages: [],
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
          pages: [],
          totalFound: 0,
          errors: [],
        } as CrawlResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter and limit URLs
    const filteredUrls = allUrls.slice(0, maxPages);
    console.log(`[Sitemap Crawler] Processing ${filteredUrls.length} URLs (max: ${maxPages}, total found: ${allUrls.length})`);

    // Create auth header
    const authHeader = username && applicationPassword 
      ? 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`)
      : '';

    // Process URLs
    const pages: PageInfo[] = [];
    const errors: string[] = [];

    for (const url of filteredUrls) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const slug = pathParts[pathParts.length - 1] || urlObj.pathname.replace(/\//g, '') || 'home';

        // Fetch additional info from WordPress API if credentials provided
        let postInfo: Partial<PageInfo> | null = null;
        if (authHeader) {
          postInfo = await fetchWordPressPostInfo(normalizedUrl, url, authHeader, postType);
        }

        // If WP API failed, fetch page content directly
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

        pages.push({
          id: crypto.randomUUID(),
          url: urlObj.pathname || '/',
          slug,
          title: postInfo?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          postId: postInfo?.postId,
          postType,
          wordCount,
          categories: postInfo?.categories || [],
          tags: postInfo?.tags || [],
          featuredImage: postInfo?.featuredImage,
          scoreBefore: score,
        });
      } catch (e) {
        const errorMsg = `Failed to process URL: ${url}`;
        console.error(`[Sitemap Crawler] ${errorMsg}:`, e);
        errors.push(errorMsg);
      }
    }

    console.log(`[Sitemap Crawler] Successfully processed ${pages.length} pages with ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully crawled ${pages.length} pages from sitemap`,
        pages,
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
        pages: [],
        totalFound: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      } as CrawlResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
