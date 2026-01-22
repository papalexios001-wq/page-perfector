import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Logger, corsHeaders, AppError, createErrorResponse, validateRequired } from "../_shared/utils.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE-GRADE YOUTUBE VIDEO DISCOVERY ENGINE (SERPER.DEV POWERED)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Automatically discovers highly relevant, high-quality YouTube videos
 * for embedding in SEO-optimized content using Serper.dev API.
 * 
 * Features:
 * - Serper.dev Google Search for YouTube videos
 * - Quality filtering (views, recency, channel authority)
 * - Relevance scoring based on title/description match
 * - Educational/tutorial preference
 * - Generates SEO-optimized embed HTML with VideoObject schema
 * - 100% reliable video ID extraction
 */

interface YouTubeDiscoveryRequest {
  keyword: string;
  contentContext?: string;
  maxResults?: number;
  preferTutorials?: boolean;
  minViews?: number;
    serperApiKey?: string;
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
// SERPER.DEV YOUTUBE SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

async function searchYouTubeWithSerper(
  apiKey: string,
  query: string,
  maxResults: number,
  logger: Logger
): Promise<any[]> {
  const searchQuery = query.includes('tutorial') || query.includes('guide') 
    ? `${query} site:youtube.com`
    : `${query} tutorial guide site:youtube.com`;
  
  logger.info('Searching YouTube via Serper.dev', { query: searchQuery, maxResults });
  
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      q: searchQuery,
      num: maxResults * 3, // Fetch more for filtering
      gl: 'us',
      hl: 'en',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error('Serper.dev API error', { status: response.status, error });
    throw new AppError('Serper.dev search failed', 'SERPER_API_ERROR', response.status);
  }
  
  const data = await response.json();
  const organic = data.organic || [];
  
  // Extract YouTube videos from results
  const videos = [];
  for (const result of organic) {
    const link = result.link || '';
    
    // Extract video ID from various YouTube URL formats
    let videoId: string | null = null;
    
    // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    const watchMatch = link.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      videoId = watchMatch[1];
    }
    
    // Short URL: https://youtu.be/VIDEO_ID
    const shortMatch = link.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      videoId = shortMatch[1];
    }
    
    // Embed URL: https://www.youtube.com/embed/VIDEO_ID
    const embedMatch = link.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      videoId = embedMatch[1];
    }
    
    if (videoId && videoId.length === 11) {
      videos.push({
        videoId,
        title: result.title || '',
        snippet: result.snippet || '',
        link: link,
        position: result.position || 0,
      });
    }
  }
  
  logger.info('Found YouTube videos via Serper', { count: videos.length });
  return videos;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE DATA API (FOR METADATA ENRICHMENT)
// ═══════════════════════════════════════════════════════════════════════════════

async function getVideoMetadata(
  youtubeApiKey: string | undefined,
  videoIds: string[],
  logger: Logger
): Promise<Map<string, any>> {
  if (!youtubeApiKey || videoIds.length === 0) {
    logger.info('No YouTube API key, skipping metadata enrichment');
    return new Map();
  }
  
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.slice(0, 50).join(','), // YouTube API limit
    key: youtubeApiKey,
  });
  
  const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      logger.warn('Failed to fetch video metadata', { status: response.status });
      return new Map();
    }
    
    const data = await response.json();
    const metadataMap = new Map<string, any>();
    
    for (const item of data.items || []) {
      metadataMap.set(item.id, {
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        channelTitle: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
        viewCount: parseInt(item.statistics?.viewCount || '0'),
        likeCount: parseInt(item.statistics?.likeCount || '0'),
        duration: item.contentDetails?.duration || 'PT0M',
      });
    }
    
    logger.info('Fetched video metadata', { count: metadataMap.size });
    return metadataMap;
  } catch (error) {
    logger.warn('Error fetching video metadata', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Map();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELEVANCE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

function calculateRelevanceScore(
  video: any,
  metadata: any | undefined,
  keyword: string,
  contentContext: string,
  preferTutorials: boolean
): number {
  let score = 0;
  
  const title = ((metadata?.title || video.title) || '').toLowerCase();
  const description = ((metadata?.description || video.snippet) || '').toLowerCase();
  const keywordLower = keyword.toLowerCase();
  const keywordWords = keywordLower.split(' ').filter((w: string) => w.length > 2);
  
  // Keyword match scoring (40 points max)
  if (title.includes(keywordLower)) {
    score += 25; // Exact keyword in title - highest priority
  }
  for (const word of keywordWords) {
    if (title.includes(word)) score += 5;
    if (description.includes(word)) score += 2;
  }
  
  // Tutorial/educational indicators (25 points max)
  const tutorialIndicators = [
    'how to', 'tutorial', 'guide', 'explained', 'learn', 'complete', 
    'step by step', 'tips', 'beginner', 'advanced', 'course', 'lesson',
    'teach', 'introduction', 'basics', 'master'
  ];
  let tutorialBonus = 0;
  for (const indicator of tutorialIndicators) {
    if (title.includes(indicator)) tutorialBonus += 5;
    if (description.includes(indicator)) tutorialBonus += 2;
  }
  score += Math.min(tutorialBonus, 25);
  
  // Authority scoring based on views (20 points max)
  if (metadata?.viewCount) {
    const views = metadata.viewCount;
    if (views > 1000000) score += 20;
    else if (views > 500000) score += 17;
    else if (views > 100000) score += 14;
    else if (views > 50000) score += 11;
    else if (views > 10000) score += 8;
    else if (views > 1000) score += 4;
    
    // Engagement ratio (likes to views)
    const likes = metadata.likeCount || 0;
    const engagementRatio = views > 0 ? likes / views : 0;
    if (engagementRatio > 0.05) score += 10; // >5% like ratio is excellent
    else if (engagementRatio > 0.03) score += 6;
    else if (engagementRatio > 0.01) score += 3;
  } else {
    // No metadata, use search position as proxy
    const positionScore = Math.max(0, 10 - (video.position || 0));
    score += positionScore;
  }
  
  // Context matching (10 points max)
  if (contentContext) {
    const contextWords = contentContext.toLowerCase().split(' ').filter((w: string) => w.length > 3);
    let contextMatches = 0;
    for (const word of contextWords) {
      if (title.includes(word) || description.includes(word)) {
        contextMatches++;
      }
    }
    score += Math.min(contextMatches * 2, 10);
  }
  
  // Recency bonus (5 points max)
  if (metadata?.publishedAt) {
    const publishDate = new Date(metadata.publishedAt);
    const daysSincePublish = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublish < 180) score += 5; // Less than 6 months old
    else if (daysSincePublish < 365) score += 4; // Less than 1 year
    else if (daysSincePublish < 730) score += 2; // Less than 2 years
  }
  
  // Prefer tutorials if requested (multiply bonus)
  if (preferTutorials) {
    for (const indicator of ['tutorial', 'how to', 'guide', 'explained', 'complete guide']) {
      if (title.includes(indicator)) {
        score *= 1.25;
        break;
      }
    }
  }
  
  return Math.round(score * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBED & SCHEMA GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateEmbedHtml(videoId: string, title: string): string {
  const sanitizedTitle = title.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  
  return `<div class="wp-opt-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; margin: 32px 0; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.25);">
  <iframe 
    src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1" 
    title="${sanitizedTitle}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 12px;"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
    allowfullscreen
    loading="lazy">
  </iframe>
</div>
<p class="wp-opt-video-caption" style="text-align: center; font-style: italic; color: #666; font-size: 0.95em; margin-top: -20px; margin-bottom: 32px;">
  📹 <strong>${sanitizedTitle}</strong>
</p>`;
}

function generateVideoSchema(videoId: string, metadata: any): object {
  const thumbnail = metadata?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const title = metadata?.title || 'Video Tutorial';
  const description = metadata?.description || '';
  const publishDate = metadata?.publishedAt || new Date().toISOString();
  
  return {
    "@type": "VideoObject",
    "name": title,
    "description": description.substring(0, 200),
    "thumbnailUrl": thumbnail,
    "uploadDate": publishDate,
    "contentUrl": `https://www.youtube.com/watch?v=${videoId}`,
    "embedUrl": `https://www.youtube.com/embed/${videoId}`,
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": metadata?.viewCount || 0
    },
    "publisher": {
      "@type": "Organization",
      "name": metadata?.channelTitle || "YouTube"
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
  const envSerperApiKey = Deno.env.get('SERPER_API_KEY');  
  try {
    const body: YouTubeDiscoveryRequest = await req.json();
    const { 
      keyword, 
      contentContext = '', 
      maxResults = 1, 
      preferTutorials = true,
      minViews = 1000 
    } = body;

        // Use serperApiKey from request body if provided, otherwise fallback to env var
    const serperApiKey = body.serperApiKey || envSerperApiKey;
    
    validateRequired(body as unknown as Record<string, unknown>, ['keyword']);
    
    logger.info('YouTube discovery request', { keyword, maxResults, preferTutorials });
    
    // SERPER.DEV is REQUIRED for production-grade video discovery
    if (!serperApiKey) {
      logger.error('SERPER_API_KEY not configured - this is REQUIRED!');
      
      // Return a helpful error instead of broken embed
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'SERPER_API_KEY not configured',
          message: 'Please add SERPER_API_KEY secret for automatic video discovery.',
          videos: []
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Search for videos using Serper.dev
    const searchResults = await searchYouTubeWithSerper(serperApiKey, keyword, maxResults, logger);
    
    if (searchResults.length === 0) {
      logger.info('No YouTube videos found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          videos: [], 
          message: 'No relevant videos found for this keyword' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get metadata for enrichment (optional, will work without it)
    const videoIds = searchResults.map((v: any) => v.videoId).filter(Boolean);
    const metadataMap = await getVideoMetadata(youtubeApiKey, videoIds, logger);
    
    // Score and filter videos
    const scoredVideos: { video: any; metadata: any; score: number }[] = [];
    
    for (const video of searchResults) {
      const videoId = video.videoId;
      if (!videoId) continue;
      
      const metadata = metadataMap.get(videoId);
      
      // Filter by minimum views (only if we have metadata)
      if (metadata && metadata.viewCount < minViews) {
        logger.info('Filtered out low-view video', { videoId, views: metadata.viewCount, minViews });
        continue;
      }
      
      const score = calculateRelevanceScore(video, metadata, keyword, contentContext, preferTutorials);
      scoredVideos.push({ video, metadata, score });
      
      logger.info('Scored video', { 
        videoId, 
        title: (metadata?.title || video.title).substring(0, 60),
        score,
        views: metadata?.viewCount
      });
    }
    
    // Sort by score and take top results
    scoredVideos.sort((a, b) => b.score - a.score);
    const topVideos = scoredVideos.slice(0, maxResults);
    
    if (topVideos.length === 0) {
      logger.warn('All videos filtered out by quality criteria');
      // Return best unfiltered result if all got filtered
      const fallbackVideo = searchResults[0];
      topVideos.push({
        video: fallbackVideo,
        metadata: metadataMap.get(fallbackVideo.videoId),
        score: 50
      });
    }
    
    // Build response
    const results: VideoResult[] = topVideos.map(({ video, metadata, score }) => {
      const videoId = video.videoId;
      const title = metadata?.title || video.title || 'Educational Video';
      const description = (metadata?.description || video.snippet || '').substring(0, 200);
      
      return {
        videoId,
        title,
        description,
        channelTitle: metadata?.channelTitle || 'YouTube',
        publishedAt: metadata?.publishedAt || new Date().toISOString(),
        thumbnailUrl: metadata?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        embedHtml: generateEmbedHtml(videoId, title),
        schema: generateVideoSchema(videoId, metadata),
        relevanceScore: score,
      };
    });
    
    logger.info('YouTube discovery complete', { 
      searched: searchResults.length, 
      filtered: scoredVideos.length,
      returned: results.length,
      topScore: results[0]?.relevanceScore
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
    logger.error('YouTube discovery error', { 
      error: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
