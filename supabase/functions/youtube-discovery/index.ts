import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Logger, corsHeaders, AppError, createErrorResponse, validateRequired } from "../_shared/utils.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE-GRADE YOUTUBE VIDEO DISCOVERY ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Automatically discovers highly relevant, high-quality YouTube videos
 * for embedding in SEO-optimized content.
 * 
 * Features:
 * - YouTube Data API v3 search
 * - Quality filtering (views, likes, channel authority)
 * - Relevance scoring based on title/description match
 * - Educational/tutorial preference
 * - Generates SEO-optimized embed HTML with VideoObject schema
 */

interface YouTubeDiscoveryRequest {
  keyword: string;
  contentContext?: string;
  maxResults?: number;
  preferTutorials?: boolean;
  minViews?: number;
}

interface VideoResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  embedHtml: string;
  schema: object;
  relevanceScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function searchYouTube(
  apiKey: string,
  query: string,
  maxResults: number,
  logger: Logger
): Promise<any[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(maxResults * 2), // Fetch more for filtering
    order: 'relevance',
    videoEmbeddable: 'true',
    videoDuration: 'medium', // 4-20 minutes (educational sweet spot)
    safeSearch: 'strict',
    key: apiKey,
  });
  
  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  
  logger.info('Searching YouTube', { query, maxResults });
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.text();
    logger.error('YouTube API error', { status: response.status, error });
    throw new AppError('YouTube API search failed', 'YOUTUBE_API_ERROR', response.status);
  }
  
  const data = await response.json();
  return data.items || [];
}

async function getVideoStats(
  apiKey: string,
  videoIds: string[],
  logger: Logger
): Promise<Map<string, any>> {
  const params = new URLSearchParams({
    part: 'statistics,contentDetails',
    id: videoIds.join(','),
    key: apiKey,
  });
  
  const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    logger.warn('Failed to fetch video stats');
    return new Map();
  }
  
  const data = await response.json();
  const statsMap = new Map<string, any>();
  
  for (const item of data.items || []) {
    statsMap.set(item.id, {
      viewCount: parseInt(item.statistics?.viewCount || '0'),
      likeCount: parseInt(item.statistics?.likeCount || '0'),
      duration: item.contentDetails?.duration || 'PT0M',
    });
  }
  
  return statsMap;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELEVANCE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

function calculateRelevanceScore(
  video: any,
  stats: any,
  keyword: string,
  contentContext: string,
  preferTutorials: boolean
): number {
  let score = 0;
  
  const title = (video.snippet?.title || '').toLowerCase();
  const description = (video.snippet?.description || '').toLowerCase();
  const keywordLower = keyword.toLowerCase();
  const keywordWords = keywordLower.split(' ').filter(w => w.length > 2);
  
  // Keyword match scoring (40 points max)
  if (title.includes(keywordLower)) {
    score += 20; // Exact keyword in title
  }
  for (const word of keywordWords) {
    if (title.includes(word)) score += 5;
    if (description.includes(word)) score += 2;
  }
  
  // Tutorial/educational indicators (20 points max)
  const tutorialIndicators = ['how to', 'tutorial', 'guide', 'explained', 'learn', 'complete', 'step by step', 'tips', 'beginner', 'advanced'];
  for (const indicator of tutorialIndicators) {
    if (title.includes(indicator)) score += 4;
    if (description.includes(indicator)) score += 1;
  }
  
  // Authority scoring based on views (20 points max)
  if (stats) {
    const views = stats.viewCount || 0;
    if (views > 1000000) score += 20;
    else if (views > 100000) score += 15;
    else if (views > 10000) score += 10;
    else if (views > 1000) score += 5;
    
    // Engagement ratio (likes to views)
    const likes = stats.likeCount || 0;
    const engagementRatio = views > 0 ? likes / views : 0;
    if (engagementRatio > 0.05) score += 10; // >5% like ratio is excellent
    else if (engagementRatio > 0.03) score += 5;
  }
  
  // Context matching (10 points max)
  if (contentContext) {
    const contextWords = contentContext.toLowerCase().split(' ').filter(w => w.length > 3);
    let contextMatches = 0;
    for (const word of contextWords) {
      if (title.includes(word) || description.includes(word)) {
        contextMatches++;
      }
    }
    score += Math.min(contextMatches * 2, 10);
  }
  
  // Recency bonus (5 points max)
  const publishDate = new Date(video.snippet?.publishedAt || 0);
  const daysSincePublish = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublish < 180) score += 5; // Less than 6 months old
  else if (daysSincePublish < 365) score += 3; // Less than 1 year
  else if (daysSincePublish < 730) score += 1; // Less than 2 years
  
  // Prefer tutorials if requested
  if (preferTutorials) {
    for (const indicator of ['tutorial', 'how to', 'guide', 'explained']) {
      if (title.includes(indicator)) {
        score *= 1.2;
        break;
      }
    }
  }
  
  return score;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBED & SCHEMA GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateEmbedHtml(videoId: string, title: string): string {
  return `
<div class="wp-opt-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; margin: 24px 0; box-shadow: 0 8px 32px -8px rgba(0,0,0,0.2);">
  <iframe 
    src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1" 
    title="${title.replace(/"/g, '&quot;')}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 12px;"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
    allowfullscreen
    loading="lazy">
  </iframe>
</div>
<p class="wp-opt-video-caption" style="text-align: center; font-style: italic; color: #666; margin-top: -16px; margin-bottom: 24px;">
  📹 <strong>${title}</strong>
</p>`;
}

function generateVideoSchema(video: any, stats: any): object {
  const publishDate = video.snippet?.publishedAt || new Date().toISOString();
  const thumbnail = video.snippet?.thumbnails?.high?.url || 
                    video.snippet?.thumbnails?.medium?.url ||
                    video.snippet?.thumbnails?.default?.url;
  
  return {
    "@type": "VideoObject",
    "name": video.snippet?.title || '',
    "description": (video.snippet?.description || '').substring(0, 200),
    "thumbnailUrl": thumbnail,
    "uploadDate": publishDate,
    "contentUrl": `https://www.youtube.com/watch?v=${video.id?.videoId}`,
    "embedUrl": `https://www.youtube.com/embed/${video.id?.videoId}`,
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": stats?.viewCount || 0
    },
    "publisher": {
      "@type": "Organization",
      "name": video.snippet?.channelTitle || ''
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const logger = new Logger('youtube-discovery');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  
  try {
    const body: YouTubeDiscoveryRequest = await req.json();
    const { 
      keyword, 
      contentContext = '', 
      maxResults = 1, 
      preferTutorials = true,
      minViews = 1000 
    } = body;
    
    validateRequired(body as unknown as Record<string, unknown>, ['keyword']);
    
    logger.info('YouTube discovery request', { keyword, maxResults, preferTutorials });
    
    // If no API key, use a fallback search approach
    if (!youtubeApiKey) {
      logger.warn('No YouTube API key configured, returning fallback search URL');
      
      // Generate a search-based embed that shows relevant results
      const searchQuery = encodeURIComponent(`${keyword} tutorial guide`);
      const fallbackEmbed = `
<div class="wp-opt-tip">
  <strong>📹 Recommended Video Resource</strong>
  <p>Search for helpful videos on this topic: <a href="https://www.youtube.com/results?search_query=${searchQuery}" target="_blank" rel="noopener">Watch "${keyword}" tutorials on YouTube →</a></p>
</div>`;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          videos: [],
          fallbackEmbed,
          message: 'YouTube API key not configured. Add YOUTUBE_API_KEY secret for automatic video discovery.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Search for videos
    const searchResults = await searchYouTube(youtubeApiKey, keyword, maxResults * 3, logger);
    
    if (searchResults.length === 0) {
      logger.info('No YouTube videos found');
      return new Response(
        JSON.stringify({ success: true, videos: [], message: 'No relevant videos found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get video stats
    const videoIds = searchResults.map((v: any) => v.id?.videoId).filter(Boolean);
    const statsMap = await getVideoStats(youtubeApiKey, videoIds, logger);
    
    // Score and filter videos
    const scoredVideos: { video: any; stats: any; score: number }[] = [];
    
    for (const video of searchResults) {
      const videoId = video.id?.videoId;
      if (!videoId) continue;
      
      const stats = statsMap.get(videoId);
      
      // Filter by minimum views
      if (stats && stats.viewCount < minViews) continue;
      
      const score = calculateRelevanceScore(video, stats, keyword, contentContext, preferTutorials);
      scoredVideos.push({ video, stats, score });
    }
    
    // Sort by score and take top results
    scoredVideos.sort((a, b) => b.score - a.score);
    const topVideos = scoredVideos.slice(0, maxResults);
    
    // Build response
    const results: VideoResult[] = topVideos.map(({ video, stats, score }) => {
      const videoId = video.id.videoId;
      const title = video.snippet?.title || '';
      
      return {
        videoId,
        title,
        description: (video.snippet?.description || '').substring(0, 200),
        channelTitle: video.snippet?.channelTitle || '',
        publishedAt: video.snippet?.publishedAt || '',
        thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
        embedHtml: generateEmbedHtml(videoId, title),
        schema: generateVideoSchema(video, stats),
        relevanceScore: score,
      };
    });
    
    logger.info('YouTube discovery complete', { 
      found: searchResults.length, 
      filtered: scoredVideos.length,
      returned: results.length 
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        videos: results,
        stats: {
          totalSearched: searchResults.length,
          passedFilters: scoredVideos.length,
          returned: results.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('YouTube discovery error', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
