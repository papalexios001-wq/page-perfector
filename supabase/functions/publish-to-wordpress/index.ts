import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  pageId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  publishStatus?: 'draft' | 'publish';
  optimization: {
    optimizedTitle: string;
    metaDescription: string;
    h1: string;
    h2s: string[];
    optimizedContent?: string;
    schema?: Record<string, unknown>;
    internalLinks?: Array<{ anchor: string; target: string; position: number }>;
  };
  options?: {
    preserveCategories?: boolean;
    preserveTags?: boolean;
    preserveSlug?: boolean;
    preserveFeaturedImage?: boolean;
    updateYoast?: boolean;
    updateRankMath?: boolean;
  };
}

interface PublishResult {
  success: boolean;
  message: string;
  postId?: number;
  postUrl?: string;
  before?: {
    title: string;
    metaDescription?: string;
  };
  after?: {
    title: string;
    metaDescription: string;
  };
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { 
      pageId, 
      siteUrl, 
      username, 
      applicationPassword,
      publishStatus = 'draft',
      optimization,
      options = {}
    }: PublishRequest = await req.json();

    console.log(`[Publish] Starting publish for page: ${pageId}`);

    if (!pageId || !siteUrl || !username || !applicationPassword || !optimization) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          error: 'pageId, siteUrl, credentials, and optimization are required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get page data from database
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError || !pageData) {
      throw new Error('Page not found in database');
    }

    // FIX #1: If post_id is missing, try to find it by URL slug
    let postId = pageData.post_id;

    if (!postId) {
      console.log(`[Publish] No post_id found, searching by slug: ${pageData.slug}`);
      
      // Normalize URL first
      let normalizedUrl = siteUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      const credentials = `${username}:${applicationPassword}`;
      const authHeader = 'Basic ' + btoa(credentials);

      const slug = pageData.slug || pageData.url.split('/').filter(Boolean).pop() || '';
      
      // Try posts endpoint first
      const searchResponse = await fetch(
        `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit&per_page=100`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': authHeader,
            'User-Agent': 'WP-Perfector/1.0',
          },
        }
      );

      if (searchResponse.ok) {
        const posts = await searchResponse.json();
        if (Array.isArray(posts) && posts.length > 0) {
          postId = posts[0].id;
          console.log(`[Publish] Found post via slug: ${postId}`);
          
          // Update page with post_id for future use
          await supabase
            .from('pages')
            .update({ post_id: postId })
            .eq('id', pageId);
        }
      }

      // If still not found, try pages endpoint
      if (!postId) {
        const pagesResponse = await fetch(
          `${normalizedUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&context=edit&per_page=100`,
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
              'User-Agent': 'WP-Perfector/1.0',
            },
          }
        );

        if (pagesResponse.ok) {
          const wpPages = await pagesResponse.json();
          if (Array.isArray(wpPages) && wpPages.length > 0) {
            postId = wpPages[0].id;
            console.log(`[Publish] Found page via slug: ${postId}`);
            
            await supabase
              .from('pages')
              .update({ post_id: postId })
              .eq('id', pageId);
          }
        }
      }
    }

    if (!postId) {
      throw new Error(
        `Cannot find WordPress post for slug "${pageData.slug}". ` +
        `The page may not exist in WordPress. Re-crawl your sitemap with valid content.`
      );
    }

    // Normalize URL
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    // Build auth header - don't strip spaces from application password
    const credentials = `${username}:${applicationPassword}`;
    const authHeader = 'Basic ' + btoa(credentials);
    console.log(`[Publish] Using Basic Auth for user: ${username}`);

    // First, verify the post exists in WordPress
    console.log(`[Publish] Verifying post exists: ${postId}`);
    const currentPostResponse = await fetch(
      `${normalizedUrl}/wp-json/wp/v2/posts/${postId}?context=edit`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
      }
    );

    // Handle specific HTTP status codes for better error messages
    if (currentPostResponse.status === 404) {
      // Try pages endpoint if post not found
      console.log(`[Publish] Post ${postId} not found, trying pages endpoint...`);
      const pageResponse = await fetch(
        `${normalizedUrl}/wp-json/wp/v2/pages/${postId}?context=edit`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': authHeader,
            'User-Agent': 'WP-Optimizer-Pro/1.0',
          },
        }
      );
      
      if (!pageResponse.ok) {
        throw new Error(`Post/Page ${postId} doesn't exist in WordPress. It may have been deleted.`);
      }
      
      // Use page endpoint for update
      console.log(`[Publish] Found as WordPress page, using pages endpoint`);
    }
    
    if (currentPostResponse.status === 401) {
      throw new Error('Authentication failed. Check your WordPress username and application password.');
    }
    
    if (currentPostResponse.status === 403) {
      throw new Error('Permission denied. Your WordPress user may not have edit_posts capability.');
    }

    if (!currentPostResponse.ok) {
      const errorText = await currentPostResponse.text();
      console.error(`[Publish] Failed to fetch current post: ${currentPostResponse.status} - ${errorText}`);
      throw new Error(`Failed to verify post exists: ${currentPostResponse.status}`);
    }

    const currentPost = await currentPostResponse.json();
    
    // Verify post is not trashed
    if (currentPost.status === 'trash') {
      throw new Error(`Post ${postId} is in trash. Restore it in WordPress before publishing.`);
    }
    
    console.log(`[Publish] Post verified. Current status: ${currentPost.status}`);
    
    const beforeState = {
      title: currentPost.title?.raw || currentPost.title?.rendered || '',
      metaDescription: currentPost.meta?._yoast_wpseo_metadesc || 
                       currentPost.meta?.rank_math_description || '',
    };

    // Build updated content with H1, H2s, and internal links if we have them
    let updatedContent = currentPost.content?.raw || currentPost.content?.rendered || '';
    
    // If optimized content is provided, use it directly
    if (optimization.optimizedContent) {
      updatedContent = optimization.optimizedContent;
    } else {
      // Otherwise, try to intelligently update the content structure
      // Replace H1 if found
      if (optimization.h1) {
        updatedContent = updatedContent.replace(
          /<h1[^>]*>.*?<\/h1>/gi,
          `<h1>${optimization.h1}</h1>`
        );
      }
      
      // Add internal links if provided
      if (optimization.internalLinks && optimization.internalLinks.length > 0) {
        // Append internal links section at the end
        const linksHtml = optimization.internalLinks.map(link => 
          `<a href="${link.target}">${link.anchor}</a>`
        ).join(', ');
        
        if (!updatedContent.includes('Related articles:')) {
          updatedContent += `\n\n<p><strong>Related articles:</strong> ${linksHtml}</p>`;
        }
      }
    }

    // Add schema markup as JSON-LD if provided
    if (optimization.schema) {
      const schemaScript = `<script type="application/ld+json">${JSON.stringify(optimization.schema)}</script>`;
      if (!updatedContent.includes('application/ld+json')) {
        updatedContent += `\n${schemaScript}`;
      }
    }

    // Build the update payload
    const updatePayload: Record<string, unknown> = {
      title: optimization.optimizedTitle,
      content: updatedContent,
      status: publishStatus,
    };

    // Preserve settings based on options
    if (options.preserveCategories && currentPost.categories) {
      updatePayload.categories = currentPost.categories;
    }
    if (options.preserveTags && currentPost.tags) {
      updatePayload.tags = currentPost.tags;
    }
    if (options.preserveSlug && currentPost.slug) {
      updatePayload.slug = currentPost.slug;
    }
    if (options.preserveFeaturedImage && currentPost.featured_media) {
      updatePayload.featured_media = currentPost.featured_media;
    }

    // Build meta payload for SEO plugins
    const metaPayload: Record<string, string> = {};
    
    if (options.updateYoast !== false) {
      metaPayload._yoast_wpseo_title = optimization.optimizedTitle;
      metaPayload._yoast_wpseo_metadesc = optimization.metaDescription;
    }
    
    if (options.updateRankMath !== false) {
      metaPayload.rank_math_title = optimization.optimizedTitle;
      metaPayload.rank_math_description = optimization.metaDescription;
    }

    if (Object.keys(metaPayload).length > 0) {
      updatePayload.meta = metaPayload;
    }

    console.log(`[Publish] Updating post ${postId} with status: ${publishStatus}`);

    // Update the WordPress post (try posts first, then pages)
    let updateEndpoint = `${normalizedUrl}/wp-json/wp/v2/posts/${postId}`;
    
    // Check if this is a page by trying the posts endpoint first
    const updateResponse = await fetch(
      updateEndpoint,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'WP-Optimizer-Pro/1.0',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[Publish] Failed to update post: ${updateResponse.status} - ${errorText}`);
      
      // Specific error handling by status code
      let errorMessage = `WordPress API error: ${updateResponse.status}`;
      
      if (updateResponse.status === 401) {
        errorMessage = 'Authentication failed. Check username/application password.';
      } else if (updateResponse.status === 403) {
        errorMessage = 'Permission denied. User lacks edit_posts capability.';
      } else if (updateResponse.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.code || 'Invalid request payload';
        } catch {
          errorMessage = 'Invalid request payload sent to WordPress';
        }
      } else if (updateResponse.status === 404) {
        errorMessage = 'Post not found. It may have been deleted.';
      } else {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch {
          // Keep default message
        }
      }
      
      console.error(`[Publish] Detailed error: ${errorMessage}`, { status: updateResponse.status, body: errorText });
      throw new Error(errorMessage);
    }

    const updatedPost = await updateResponse.json();
    
    console.log(`[Publish] Successfully updated post: ${updatedPost.id}`);

    // Update page status in database
    await supabase
      .from('pages')
      .update({
        status: 'published',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pageId);

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        page_id: pageId,
        type: 'success',
        message: `Published to WordPress as ${publishStatus}`,
        details: {
          postId: updatedPost.id,
          postUrl: updatedPost.link,
          before: beforeState,
          after: {
            title: optimization.optimizedTitle,
            metaDescription: optimization.metaDescription,
          },
        },
      });

    const result: PublishResult = {
      success: true,
      message: `Successfully published to WordPress as ${publishStatus}`,
      postId: updatedPost.id,
      postUrl: updatedPost.link,
      before: beforeState,
      after: {
        title: optimization.optimizedTitle,
        metaDescription: optimization.metaDescription,
      },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[Publish] Error:', errorMessage);

    // Build structured error details for logging
    const errorDetails = {
      timestamp: new Date().toISOString(),
      endpoint: 'publish-to-wordpress',
      errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    };

    console.error('[Publish] Error details:', JSON.stringify(errorDetails));

    // Log failure to activity_log with full context
    try {
      const requestBody = await req.clone().json().catch(() => ({}));
      const pageId = requestBody.pageId;
      
      if (pageId) {
        await supabase
          .from('activity_log')
          .insert({
            page_id: pageId,
            type: 'error',
            message: `Publish failed: ${errorMessage}`,
            details: errorDetails,
          });
      }
    } catch (e) {
      console.error('[Publish] Failed to log error to activity_log:', e);
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Publish failed',
        error: errorMessage,
      } as PublishResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
