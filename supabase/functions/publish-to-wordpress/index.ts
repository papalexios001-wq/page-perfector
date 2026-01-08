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
  fetchWithRetry,
} from "../_shared/utils.ts";

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
  before?: { title: string; metaDescription?: string };
  after?: { title: string; metaDescription: string };
  cached?: boolean;
  requestId?: string;
  error?: string;
}

serve(async (req) => {
  const idempotencyKey = req.headers.get('x-idempotency-key');
  const logger = new Logger('publish-to-wordpress');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let pageId: string | undefined;

  try {
    const body: PublishRequest = await req.json();
    pageId = body.pageId;
    const { siteUrl, username, applicationPassword, publishStatus = 'draft', optimization, options = {} } = body;

    // Validate required fields
    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword', 'optimization']);

    logger.info('Starting publish', { pageId, siteUrl, publishStatus });

    // Rate limiting: 20 publishes per minute per site
    const rateLimitKey = `publish:${siteUrl}`;
    const rateLimit = checkRateLimit(rateLimitKey, 20, 60000);
    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded', { siteUrl, retryAfterMs: rateLimit.retryAfterMs });
      throw new AppError(
        `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // Idempotency check - use header key or generate from pageId + publishStatus + timestamp (30 second window)
    const idemKey = idempotencyKey || generateIdempotencyKey('publish', pageId, publishStatus, Math.floor(Date.now() / 30000).toString());
    
    const { result: publishResult, cached } = await withIdempotency<PublishResult>(
      idemKey,
      async () => {
        // Get page data from database
        const { data: pageData, error: pageError } = await supabase
          .from('pages')
          .select('*')
          .eq('id', pageId)
          .single();

        if (pageError || !pageData) {
          throw new AppError('Page not found in database', 'PAGE_NOT_FOUND', 404);
        }

        // Normalize URL
        let normalizedUrl = siteUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
        }
        normalizedUrl = normalizedUrl.replace(/\/+$/, '');

        const credentials = `${username}:${applicationPassword}`;
        const authHeader = 'Basic ' + btoa(credentials);

        // If post_id is missing, try to find it by URL slug
        let postId = pageData.post_id;

        if (!postId) {
          logger.info('No post_id found, searching by slug', { slug: pageData.slug });
          
          const slug = pageData.slug || pageData.url.split('/').filter(Boolean).pop() || '';
          
          // Try posts endpoint first (with retry)
          try {
            const searchResponse = await fetchWithRetry(
              `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit&per_page=100`,
              {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': authHeader,
                  'User-Agent': 'WP-Perfector/1.0',
                },
              },
              { maxRetries: 2, initialDelayMs: 500 }
            );

            if (searchResponse.ok) {
              const posts = await searchResponse.json();
              if (Array.isArray(posts) && posts.length > 0) {
                postId = posts[0].id;
                logger.info('Found post via slug', { postId });
                
                // Update page with post_id for future use
                await supabase.from('pages').update({ post_id: postId }).eq('id', pageId);
              }
            }
          } catch (e) {
            logger.warn('Failed to search posts by slug', { error: e instanceof Error ? e.message : 'Unknown' });
          }

          // If still not found, try pages endpoint
          if (!postId) {
            try {
              const pagesResponse = await fetchWithRetry(
                `${normalizedUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&context=edit&per_page=100`,
                {
                  headers: {
                    'Accept': 'application/json',
                    'Authorization': authHeader,
                    'User-Agent': 'WP-Perfector/1.0',
                  },
                },
                { maxRetries: 2, initialDelayMs: 500 }
              );

              if (pagesResponse.ok) {
                const wpPages = await pagesResponse.json();
                if (Array.isArray(wpPages) && wpPages.length > 0) {
                  postId = wpPages[0].id;
                  logger.info('Found page via slug', { postId });
                  await supabase.from('pages').update({ post_id: postId }).eq('id', pageId);
                }
              }
            } catch (e) {
              logger.warn('Failed to search pages by slug', { error: e instanceof Error ? e.message : 'Unknown' });
            }
          }
        }

        if (!postId) {
          throw new AppError(
            `Cannot find WordPress post for slug "${pageData.slug}". Re-crawl your sitemap.`,
            'POST_NOT_FOUND',
            404
          );
        }

        logger.info('Verifying post exists', { postId });

        // Verify the post exists in WordPress (with retry)
        const currentPostResponse = await fetchWithRetry(
          `${normalizedUrl}/wp-json/wp/v2/posts/${postId}?context=edit`,
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
              'User-Agent': 'WP-Optimizer-Pro/1.0',
            },
          },
          { maxRetries: 2, initialDelayMs: 1000 }
        );

        // Handle specific HTTP status codes
        if (currentPostResponse.status === 404) {
          // Try pages endpoint
          logger.info('Post not found, trying pages endpoint');
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
            throw new AppError(`Post/Page ${postId} doesn't exist in WordPress`, 'WP_POST_NOT_FOUND', 404);
          }
        } else if (currentPostResponse.status === 401) {
          throw new AppError('Authentication failed. Check username/application password.', 'WP_AUTH_FAILED', 401);
        } else if (currentPostResponse.status === 403) {
          throw new AppError('Permission denied. User lacks edit_posts capability.', 'WP_PERMISSION_DENIED', 403);
        } else if (!currentPostResponse.ok) {
          const errorText = await currentPostResponse.text();
          logger.error('Failed to fetch current post', { status: currentPostResponse.status, body: errorText.substring(0, 500) });
          throw new AppError(`Failed to verify post exists: ${currentPostResponse.status}`, 'WP_API_ERROR', 500);
        }

        const currentPost = await currentPostResponse.json();
        
        if (currentPost.status === 'trash') {
          throw new AppError(`Post ${postId} is in trash. Restore it first.`, 'WP_POST_TRASHED', 400);
        }
        
        logger.info('Post verified', { currentStatus: currentPost.status });
        
        const beforeState = {
          title: currentPost.title?.raw || currentPost.title?.rendered || '',
          metaDescription: currentPost.meta?._yoast_wpseo_metadesc || currentPost.meta?.rank_math_description || '',
        };

        // Build updated content
        let updatedContent = currentPost.content?.raw || currentPost.content?.rendered || '';
        
        if (optimization.optimizedContent) {
          updatedContent = optimization.optimizedContent;
        } else {
          if (optimization.h1) {
            updatedContent = updatedContent.replace(/<h1[^>]*>.*?<\/h1>/gi, `<h1>${optimization.h1}</h1>`);
          }
          
          if (optimization.internalLinks && optimization.internalLinks.length > 0) {
            const linksHtml = optimization.internalLinks.map(link => 
              `<a href="${link.target}">${link.anchor}</a>`
            ).join(', ');
            
            if (!updatedContent.includes('Related articles:')) {
              updatedContent += `\n\n<p><strong>Related articles:</strong> ${linksHtml}</p>`;
            }
          }
        }

        // Add schema markup
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

        logger.info('Updating post', { postId, publishStatus });

        // Update the WordPress post (with retry)
        const updateResponse = await withRetry(
          () => fetch(
            `${normalizedUrl}/wp-json/wp/v2/posts/${postId}`,
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
          ),
          {
            maxRetries: 2,
            initialDelayMs: 1000,
            retryableStatuses: [408, 429, 500, 502, 503, 504],
            onRetry: (attempt, error, delay) => {
              logger.warn('Retrying WP update', { attempt, error: error.message, delayMs: delay });
            },
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          logger.error('Failed to update post', { status: updateResponse.status, body: errorText.substring(0, 500) });
          
          let errorMessage = `WordPress API error: ${updateResponse.status}`;
          if (updateResponse.status === 401) {
            errorMessage = 'Authentication failed. Check username/application password.';
          } else if (updateResponse.status === 403) {
            errorMessage = 'Permission denied. User lacks edit_posts capability.';
          } else if (updateResponse.status === 400) {
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.message || 'Invalid request payload';
            } catch {
              errorMessage = 'Invalid request payload';
            }
          } else if (updateResponse.status === 404) {
            errorMessage = 'Post not found. It may have been deleted.';
          }
          
          throw new AppError(errorMessage, 'WP_UPDATE_FAILED', updateResponse.status);
        }

        const updatedPost = await updateResponse.json();
        logger.info('Successfully updated post', { postId: updatedPost.id });

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
              after: { title: optimization.optimizedTitle, metaDescription: optimization.metaDescription },
              requestId: logger.getRequestId(),
            },
          });

        return {
          success: true,
          message: `Successfully published to WordPress as ${publishStatus}`,
          postId: updatedPost.id,
          postUrl: updatedPost.link,
          before: beforeState,
          after: { title: optimization.optimizedTitle, metaDescription: optimization.metaDescription },
          requestId: logger.getRequestId(),
        };
      },
      300000 // 5 minute TTL for idempotency
    );

    if (cached) {
      logger.info('Returning cached publish result', { pageId });
    }

    return new Response(
      JSON.stringify({ ...publishResult, cached }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Publish failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      pageId 
    });

    // Log failure to activity_log
    if (pageId) {
      try {
        await supabase.from('activity_log').insert({
          page_id: pageId,
          type: 'error',
          message: `Publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { requestId: logger.getRequestId() },
        });
      } catch (e) {
        logger.error('Failed to log error', { error: e instanceof Error ? e.message : 'Unknown' });
      }
    }

    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
