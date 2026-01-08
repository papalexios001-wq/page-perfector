import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchPageRequest {
  siteUrl: string;
  pageUrl: string;
  postId?: number;
  username: string;
  applicationPassword: string;
}

interface PageContentResponse {
  success: boolean;
  message: string;
  content?: {
    id: number;
    title: string;
    content: string;
    excerpt: string;
    slug: string;
    status: string;
    categories: number[];
    tags: number[];
    featuredMedia: number;
    author: number;
    date: string;
    modified: string;
    wordCount: number;
  };
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteUrl, pageUrl, postId, username, applicationPassword }: FetchPageRequest = await req.json();

    console.log(`[Fetch Page] Fetching content for: ${pageUrl || postId}`);

    if (!siteUrl || (!pageUrl && !postId) || !username || !applicationPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          error: 'siteUrl, pageUrl or postId, username, and applicationPassword are required',
        } as PageContentResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize URL
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    // Create auth header
    const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);

    let postData: any;

    if (postId) {
      // Fetch by post ID
      const url = `${normalizedUrl}/wp-json/wp/v2/posts/${postId}?context=edit`;
      console.log(`[Fetch Page] Fetching by ID: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch post: ${response.status}`);
      }

      postData = await response.json();
    } else {
      // Fetch by slug
      const slug = pageUrl.split('/').filter(Boolean).pop() || '';
      const url = `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit`;
      console.log(`[Fetch Page] Fetching by slug: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch post: ${response.status}`);
      }

      const posts = await response.json();
      if (!posts || posts.length === 0) {
        throw new Error('Post not found');
      }

      postData = posts[0];
    }

    // Calculate word count
    const plainText = postData.content?.raw?.replace(/<[^>]*>/g, ' ') || 
                     postData.content?.rendered?.replace(/<[^>]*>/g, ' ') || '';
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;

    const content = {
      id: postData.id,
      title: postData.title?.raw || postData.title?.rendered || '',
      content: postData.content?.raw || postData.content?.rendered || '',
      excerpt: postData.excerpt?.raw || postData.excerpt?.rendered || '',
      slug: postData.slug,
      status: postData.status,
      categories: postData.categories || [],
      tags: postData.tags || [],
      featuredMedia: postData.featured_media,
      author: postData.author,
      date: postData.date,
      modified: postData.modified,
      wordCount,
    };

    console.log(`[Fetch Page] Successfully fetched: ${content.title} (${wordCount} words)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Page content fetched successfully',
        content,
      } as PageContentResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Fetch Page] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch page content',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as PageContentResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
