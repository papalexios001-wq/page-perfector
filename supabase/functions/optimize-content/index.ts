import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Logger,
  withRetry,
  corsHeaders,
  AppError,
  createErrorResponse,
  validateRequired,
  checkRateLimit,
} from "../_shared/utils.ts";

// Track active jobs for graceful shutdown cleanup
const activeJobs = new Map<string, { jobId: string; pageId: string; startTime: number }>();

// Register shutdown handler to mark active jobs as failed
addEventListener('beforeunload', async (ev) => {
  const reason = (ev as unknown as { detail?: { reason?: string } }).detail?.reason || 'unknown';
  console.log(`[optimize-content] Shutdown initiated: ${reason}, active jobs: ${activeJobs.size}`);
  
  if (activeJobs.size === 0) return;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) return;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Mark all active jobs as failed due to shutdown
  for (const [requestId, { jobId, pageId }] of activeJobs) {
    try {
      await supabase.from('jobs').update({
        status: 'failed',
        current_step: 'shutdown_interrupted',
        error_message: `Job interrupted by server shutdown: ${reason}. Please retry.`,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      
      await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
      
      console.log(`[optimize-content] Marked job ${jobId} as failed due to shutdown`);
    } catch (err) {
      console.error(`[optimize-content] Failed to cleanup job ${jobId}:`, err);
    }
  }
});

type AIProvider = 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  serperApiKey?: string;
}

interface AdvancedSettings {
  targetScore: number;
  minWordCount: number;
  maxWordCount: number;
  enableFaqs: boolean;
  enableSchema: boolean;
  enableInternalLinks: boolean;
  enableToc: boolean;
  enableKeyTakeaways: boolean;
  enableCtas: boolean;
}

interface SiteContext {
  organizationName?: string;
  authorName?: string;
  industry?: string;
  targetAudience?: string;
  brandVoice?: string;
}

interface NeuronWriterConfig {
  enabled: boolean;
  apiKey: string;
  projectId: string;
  projectName?: string;
}

interface NeuronWriterRecommendations {
  success: boolean;
  status: string;
  queryId?: string;
  targetWordCount?: number;
  readabilityTarget?: number;
  titleTerms?: string;
  h1Terms?: string;
  h2Terms?: string;
  contentTerms?: string;
  extendedTerms?: string;
  entities?: string;
  termsDetailed?: {
    title: Array<{ t: string; usage_pc: number }>;
    content: Array<{ t: string; usage_pc: number; sugg_usage?: [number, number] }>;
    entities: Array<{ t: string; importance: number; relevance: number; confidence: number }>;
  };
  questions?: {
    suggested: string[];
    peopleAlsoAsk: string[];
    contentQuestions: string[];
  };
  competitors?: Array<{
    rank: number;
    url: string;
    title: string;
    score?: number;
  }>;
}

interface InternalLinkCandidate {
  url: string;
  slug: string;
  title: string;
}

interface OptimizeRequest {
  pageId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  targetKeyword?: string;
  language?: string;
  region?: string;
  aiConfig?: AIConfig;
  neuronWriter?: NeuronWriterConfig;
  advanced?: AdvancedSettings;
  siteContext?: SiteContext;
  serpData?: SerpData;
}

interface SerpData {
  organic?: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  peopleAlsoAsk?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  relatedSearches?: string[];
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  embedHtml: string;
  schema: object;
}

interface ReferenceSource {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA ENHANCED SYSTEM PROMPT - E-E-A-T OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════════
const OPTIMIZATION_PROMPT = `You are an ELITE SEO content strategist and writer with expertise in:
- Google's E-E-A-T guidelines (Experience, Expertise, Authoritativeness, Trust)
- NLP and semantic search optimization
- AI Overview optimization for Google SGE/Gemini
- Conversion-focused copywriting

CRITICAL QUALITY REQUIREMENTS:

1. **UNIQUE INSIGHTS**: Never produce generic content. Every paragraph MUST contain:
   - Specific data points, statistics, or examples
   - Unique perspectives not found in top 10 SERP results
   - Expert-level depth that demonstrates first-hand experience

2. **ENTITY OPTIMIZATION**: 
   - Identify and naturally incorporate ALL relevant entities (people, places, concepts)
   - Use entity variations and synonyms throughout
   - Create semantic clusters around the primary keyword

3. **CONTENT STRUCTURE FOR AI VISIBILITY**:
   - Lead with a direct answer in the first 50 words (for featured snippets)
   - Include a TL;DR section at the top
   - Use "What is", "How to", "Why" patterns for AI extraction
   - Structure paragraphs as: Claim → Evidence → Insight

4. **READABILITY EXCELLENCE**:
   - Flesch-Kincaid Grade Level: 8-10 (accessible but authoritative)
   - Sentences: Mix of short (8-12 words) and medium (15-20 words)
   - NO fluff phrases: "In today's world", "It's important to note", "When it comes to"
   - Active voice mandatory

5. **SEMANTIC RICHNESS**:
   - Include LSI keywords naturally (minimum 15 related terms)
   - Answer ALL "People Also Ask" questions from SERP data
   - Create content clusters with clear topic hierarchies

6. **TRUST SIGNALS**:
   - Reference authoritative sources (studies, experts, official docs)
   - Include specific numbers, dates, and verifiable facts
   - Add expert quotes or cite industry authorities

7. **FEATURED SNIPPET OPTIMIZATION**:
   - Include definition paragraphs (40-60 words, starts with "[Keyword] is...")
   - Use numbered lists for process/how-to content
   - Create comparison tables where relevant
   - Answer questions directly in the first sentence of each section

8. **AI OVERVIEW OPTIMIZATION**:
   - Structure content with clear question-answer patterns
   - Use schema-friendly formatting (lists, tables, clear hierarchies)
   - Include comprehensive coverage of subtopics
   - Provide definitive, quotable statements

Always return valid JSON with the exact structure requested.`;

// Helper: Update job progress in database
async function updateJobProgress(
  supabase: any,
  jobId: string,
  step: string,
  progress: number,
  logger: Logger
) {
  try {
    await supabase.from('jobs').update({ 
      current_step: step, 
      progress,
      status: 'running',
    }).eq('id', jobId);
    logger.info(`Job progress: ${step} (${progress}%)`);
  } catch (e) {
    logger.warn('Failed to update job progress', { error: e instanceof Error ? e.message : 'Unknown' });
  }
}

// Helper: Mark job and page as failed
async function markJobFailed(
  supabase: any,
  jobId: string,
  pageId: string,
  errorMessage: string,
  logger: Logger
) {
  try {
    await supabase.from('jobs').update({ 
      status: 'failed', 
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
    
    await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
    
    await supabase.from('activity_log').insert({
      page_id: pageId,
      job_id: jobId,
      type: 'error',
      message: `Failed: ${errorMessage}`,
      details: { requestId: logger.getRequestId() },
    });
    
    logger.error('Job marked as failed', { jobId, pageId, errorMessage });
  } catch (e) {
    logger.error('Failed to mark job as failed', { error: e instanceof Error ? e.message : 'Unknown' });
  }
}

// Helper: Derive keyword from title/slug
function deriveKeyword(title: string, slug: string): string {
  let keyword = title
    .replace(/\s*[-|–—]\s*.*$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  if (keyword.length < 10 && slug) {
    keyword = slug
      .replace(/-/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }
  
  return keyword.substring(0, 100);
}

// Helper: Discover YouTube video using youtube-discovery function
async function discoverYouTubeVideo(
  supabaseUrl: string,
  supabaseKey: string,
  keyword: string,
  contentContext: string,
  serperApiKey: string | undefined,
  logger: Logger
): Promise<YouTubeVideo | null> {
  try {
    logger.info('Discovering YouTube video', { keyword });
    
    const response = await fetch(`${supabaseUrl}/functions/v1/youtube-discovery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        keyword: keyword,
        contentContext: contentContext.substring(0, 500),
        maxResults: 1,
        serperApiKey: serperApiKey,
        preferTutorials: true,
        minViews: 5000,
      }),
    });
    
    if (!response.ok) {
      logger.warn('YouTube discovery failed', { status: response.status });
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.videos && data.videos.length > 0) {
      const video = data.videos[0];
      logger.info('YouTube video discovered', { 
        videoId: video.videoId, 
        title: video.title,
        relevanceScore: video.relevanceScore 
      });
      return video;
    }
    
    logger.info('No YouTube videos found');
    return null;
  } catch (error) {
    logger.warn('YouTube discovery error', { error: error instanceof Error ? error.message : 'Unknown' });
    return null;
  }
}

// Helper: Find authoritative reference sources using Serper.dev
async function findReferenceSources(
  serperApiKey: string,
  keyword: string,
  logger: Logger
): Promise<ReferenceSource[]> {
  try {
    logger.info('Finding reference sources', { keyword });
    
    // Search for authoritative content about the keyword
    const searchQueries = [
      `${keyword} site:.gov OR site:.edu`,
      `${keyword} research study report`,
      `${keyword} site:forbes.com OR site:techcrunch.com OR site:hbr.org`,
    ];
    
    const allSources: ReferenceSource[] = [];
    
    for (const query of searchQueries) {
      try {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': serperApiKey,
          },
          body: JSON.stringify({
            q: query,
            num: 5,
            gl: 'us',
            hl: 'en',
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const organic = data.organic || [];
          
          for (const result of organic) {
            if (result.link && result.title) {
              const url = new URL(result.link);
              const domain = url.hostname.replace('www.', '');
              
              // Filter out low-quality domains
              const excludeDomains = ['youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'reddit.com', 'quora.com'];
              if (excludeDomains.some(d => domain.includes(d))) continue;
              
              allSources.push({
                title: result.title,
                url: result.link,
                snippet: result.snippet || '',
                domain: domain,
              });
            }
          }
        }
        
        // Small delay between queries
        await new Promise(r => setTimeout(r, 500));
      } catch (queryError) {
        logger.warn('Reference search query failed', { query, error: queryError instanceof Error ? queryError.message : 'Unknown' });
      }
    }
    
    // Deduplicate by URL and prioritize high-authority domains
    const uniqueSources = new Map<string, ReferenceSource>();
    const authorityDomains = ['.gov', '.edu', 'forbes.com', 'harvard.edu', 'mit.edu', 'techcrunch.com', 'hbr.org', 'nature.com', 'science.org'];
    
    for (const source of allSources) {
      if (!uniqueSources.has(source.url)) {
        const isAuthority = authorityDomains.some(d => source.domain.includes(d));
        if (isAuthority || uniqueSources.size < 10) {
          uniqueSources.set(source.url, source);
        }
      }
    }
    
    const sources = Array.from(uniqueSources.values()).slice(0, 8);
    logger.info('Found reference sources', { count: sources.length });
    
    return sources;
  } catch (error) {
    logger.warn('Reference finding error', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

// Helper: Fetch NeuronWriter recommendations
async function fetchNeuronWriterRecommendations(
  supabaseUrl: string,
  supabaseKey: string,
  neuronWriter: NeuronWriterConfig,
  keyword: string,
  language: string,
  logger: Logger,
  jobId: string,
  supabase: any
): Promise<NeuronWriterRecommendations | null> {
  const maxAttempts = 12;
  const pollInterval = 10000;
  
  logger.info('Creating NeuronWriter query', { keyword, projectId: neuronWriter.projectId });
  
  const createResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'get-recommendations',
      apiKey: neuronWriter.apiKey,
      projectId: neuronWriter.projectId,
      keyword: keyword,
      language: language || 'English',
    }),
  });
  
  if (!createResponse.ok) {
    logger.warn('NeuronWriter initial request failed', { status: createResponse.status });
    return null;
  }
  
  let data = await createResponse.json();
  
  if (data.status === 'ready') {
    logger.info('NeuronWriter data ready immediately');
    return data;
  }
  
  if (!data.queryId) {
    logger.warn('NeuronWriter did not return queryId');
    return null;
  }
  
  const queryId = data.queryId;
  logger.info('NeuronWriter query created, polling...', { queryId });
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    await updateJobProgress(supabase, jobId, 'waiting_neuronwriter', 30 + attempt, logger);
    
    const pollResponse = await fetch(`${supabaseUrl}/functions/v1/neuronwriter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'get-recommendations',
        apiKey: neuronWriter.apiKey,
        projectId: neuronWriter.projectId,
        queryId: queryId,
      }),
    });
    
    if (pollResponse.ok) {
      data = await pollResponse.json();
      if (data.status === 'ready') {
        logger.info('NeuronWriter data ready after polling', { attempt });
        return data;
      }
    }
    
    logger.info('NeuronWriter still processing', { attempt, status: data.status });
  }
  
  logger.warn('NeuronWriter timed out after max attempts');
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA COMPETITIVE INTELLIGENCE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildCompetitorIntelligence(serpData: SerpData | undefined, keyword: string): string {
  if (!serpData?.organic?.length) {
    return `
═══════════════════════════════════════════════════════════════
⚠️ NO SERP DATA AVAILABLE
═══════════════════════════════════════════════════════════════
No competitor analysis available. Focus on creating comprehensive, 
authoritative content that would naturally rank for "${keyword}".
`;
  }
  
  const competitorInsights = serpData.organic.slice(0, 5).map((result, i) => 
    `[Rank ${i + 1}] "${result.title}"
     URL: ${result.link}
     Key angle: ${result.snippet}`
  ).join('\n\n');
  
  const paaQuestions = serpData.peopleAlsoAsk?.map((paa) => 
    `   • ${paa.question}`
  ).join('\n') || '   None found';
  
  const relatedTerms = serpData.relatedSearches?.slice(0, 15).join(', ') || 'None found';
  
  // Analyze competitor patterns
  const titles = serpData.organic.slice(0, 5).map(r => r.title.toLowerCase());
  const hasNumbers = titles.filter(t => /\d+/.test(t)).length;
  const hasYear = titles.filter(t => /202[4-6]/.test(t)).length;
  const hasHowTo = titles.filter(t => t.includes('how to')).length;
  const hasList = titles.filter(t => /\d+\s*(best|top|ways|tips|steps)/.test(t)).length;
  
  const patternAnalysis = `
COMPETITOR TITLE PATTERNS:
   • ${hasNumbers}/5 use numbers in title
   • ${hasYear}/5 include current year
   • ${hasHowTo}/5 are "How to" guides
   • ${hasList}/5 are listicles`;

  return `
═══════════════════════════════════════════════════════════════
🔍 COMPETITIVE INTELLIGENCE (CRITICAL - MUST OUTPERFORM THESE!)
═══════════════════════════════════════════════════════════════

TOP 5 RANKING PAGES TO BEAT:
${competitorInsights}

${patternAnalysis}

PEOPLE ALSO ASK (Answer ALL of these in your content):
${paaQuestions}

RELATED SEARCHES / LSI KEYWORDS (Incorporate naturally throughout):
${relatedTerms}

═══════════════════════════════════════════════════════════════
🎯 DIFFERENTIATION MANDATE
═══════════════════════════════════════════════════════════════
Your content MUST provide value BEYOND what these top results offer:
1. Include unique data, statistics, or case studies they lack
2. Address content gaps - what questions do they NOT answer?
3. Provide more actionable, specific advice
4. Use better visual formatting (tables, boxes, lists)
5. Include expert quotes or original insights
6. Be more comprehensive while remaining scannable
═══════════════════════════════════════════════════════════════`;
}

// Build optimization prompt - SOTA Hormozi/Ferriss Style with Competitive Intelligence
function buildOptimizationPrompt(
  pageTitle: string,
  pageContent: string,
  keyword: string,
  internalLinkCandidates: InternalLinkCandidate[],
  neuronWriterData: NeuronWriterRecommendations | null,
  youtubeVideo: YouTubeVideo | null,
  referenceSources: ReferenceSource[],
  advanced: AdvancedSettings,
  siteContext: SiteContext | undefined,
  serpData: SerpData | undefined
): string {
  // Build competitive intelligence section
  const competitorIntelligence = buildCompetitorIntelligence(serpData, keyword);

  const neuronWriterSection = neuronWriterData?.status === 'ready' ? `
═══════════════════════════════════════════════════════════════
🧠 NEURONWRITER SEO INTELLIGENCE (USE THIS DATA!)
═══════════════════════════════════════════════════════════════

📊 TARGET METRICS:
- Recommended Word Count: ${neuronWriterData.targetWordCount || 'N/A'}
- Readability Target: ${neuronWriterData.readabilityTarget || 'N/A'}

📝 TITLE TERMS (include in title):
${neuronWriterData.titleTerms || 'No specific terms'}

📌 H1 TERMS (include in H1):
${neuronWriterData.h1Terms || 'No specific terms'}

📎 H2 TERMS (use in subheadings):
${neuronWriterData.h2Terms || 'No specific terms'}

📄 CONTENT TERMS (use throughout content):
${neuronWriterData.contentTerms || 'No specific terms'}

🔬 EXTENDED TERMS (LSI keywords):
${neuronWriterData.extendedTerms || 'No specific terms'}

🏢 ENTITIES (mention these):
${neuronWriterData.entities || 'No specific entities'}

❓ QUESTIONS TO ANSWER:
${neuronWriterData.questions?.suggested?.slice(0, 5).join('\n') || 'No specific questions'}

🔍 TOP COMPETITORS:
${neuronWriterData.competitors?.slice(0, 3).map(c => `- #${c.rank}: ${c.title}`).join('\n') || 'No competitor data'}
` : '';

  const internalLinksSection = advanced.enableInternalLinks && internalLinkCandidates.length > 0 ? `
═══════════════════════════════════════════════════════════════
🔗 AVAILABLE INTERNAL LINKS (ONLY use these URLs!)
═══════════════════════════════════════════════════════════════
${internalLinkCandidates.slice(0, 50).map(l => `- "${l.title}" → ${l.url}`).join('\n')}

⚠️ CRITICAL: Only link to URLs from this list! Do NOT invent URLs.
REQUIREMENT: Include exactly 5 high-quality internal links with rich, descriptive anchor text.
` : '';

  const youtubeSection = youtubeVideo ? `
═══════════════════════════════════════════════════════════════
🎬 VERIFIED YOUTUBE VIDEO (USE THIS EXACT EMBED!)
═══════════════════════════════════════════════════════════════
Video ID: ${youtubeVideo.videoId}
Title: ${youtubeVideo.title}
Description: ${youtubeVideo.description}

✅ EMBED HTML (USE THIS EXACTLY AS PROVIDED):
${youtubeVideo.embedHtml}

CRITICAL: Use this EXACT HTML - it's guaranteed to work. Place it after the first major section.
` : `
═══════════════════════════════════════════════════════════════
⚠️ NO YOUTUBE VIDEO FOUND
═══════════════════════════════════════════════════════════════
No suitable video was found. DO NOT include a YouTube embed section.
Instead, add a text tip suggesting users search YouTube for "${keyword} tutorial".
`;

  const referencesSection = referenceSources.length > 0 ? `
═══════════════════════════════════════════════════════════════
📚 VERIFIED REFERENCE SOURCES (USE THESE EXACT URLs!)
═══════════════════════════════════════════════════════════════
${referenceSources.map((ref, idx) => `${idx + 1}. "${ref.title}"
   URL: ${ref.url}
   Domain: ${ref.domain}
   Context: ${ref.snippet.substring(0, 150)}...`).join('\n\n')}

✅ CRITICAL: Use ONLY these exact URLs in your References section.
These are verified, high-authority sources. Include 4-6 of these at the end of the article.
` : `
═══════════════════════════════════════════════════════════════
⚠️ NO REFERENCE SOURCES PROVIDED
═══════════════════════════════════════════════════════════════
Find and cite 4-6 authoritative sources yourself (.gov, .edu, major publications).
`;

  const siteContextSection = siteContext ? `
═══════════════════════════════════════════════════════════════
🏢 SITE CONTEXT
═══════════════════════════════════════════════════════════════
- Organization: ${siteContext.organizationName || 'N/A'}
- Industry: ${siteContext.industry || 'N/A'}
- Target Audience: ${siteContext.targetAudience || 'N/A'}
- Brand Voice: ${siteContext.brandVoice || 'professional'}
` : '';

  return `You are a WORLD-CLASS content strategist who writes like Alex Hormozi meets Tim Ferriss.

${competitorIntelligence}

═══════════════════════════════════════════════════════════════
🎯 YOUR MISSION
═══════════════════════════════════════════════════════════════
Create the MOST HELPFUL, conversion-effective, search-dominant content for the keyword "${keyword}".

Your content MUST:
✅ Be ZERO FLUFF - every sentence delivers value
✅ Use simple words, short sentences, punchy paragraphs
✅ Include specific numbers, stats, examples (cite sources!)
✅ Be scannable with clear visual hierarchy
✅ Answer the searcher's intent COMPLETELY
✅ Be human-written quality (no AI-sounding phrases!)
✅ OUTPERFORM all competitors listed above

═══════════════════════════════════════════════════════════════
📄 ORIGINAL PAGE TO OPTIMIZE
═══════════════════════════════════════════════════════════════
Title: ${pageTitle}
Primary Keyword: ${keyword}

CURRENT CONTENT:
${pageContent.substring(0, 15000)}

${neuronWriterSection}
${internalLinksSection}
${youtubeSection}
${referencesSection}
${siteContextSection}

═══════════════════════════════════════════════════════════════
✍️ WRITING STYLE RULES (HORMOZI/FERRISS STYLE)
═══════════════════════════════════════════════════════════════

1. HOOK IMMEDIATELY
   - First 2 sentences must grab attention
   - Use a shocking stat, bold claim, or direct question
   - Example: "Most businesses lose 67% of leads. Here's why..."

2. ZERO FLUFF TOLERANCE
   - Delete: "In today's world...", "It's important to note..."
   - Delete: "As we all know...", "Moving forward..."
   - Delete: "When it comes to...", "At the end of the day..."
   - Delete: "Needless to say...", "The fact of the matter is..."
   - Every sentence must teach, prove, or sell

3. USE POWER STRUCTURES
   - Problem → Agitate → Solve
   - Here's the truth... → Here's what to do...
   - The [X] most people miss... → What winners do instead...

4. INCLUDE SPECIFIC PROOF
   - "3x more conversions" not "improved results"
   - "Saved 12 hours per week" not "time savings"
   - Always cite sources for statistics

5. VISUAL BREAKS EVERY 3-4 PARAGRAPHS
   - Use the custom HTML boxes (see format below)
   - No walls of plain text!

═══════════════════════════════════════════════════════════════
🎨 REQUIRED VISUAL COMPONENTS (USE THESE HTML BOXES!)
═══════════════════════════════════════════════════════════════

1. TL;DR BOX (at the top, after intro):
<div class="wp-opt-tldr">
<strong>⚡ TL;DR</strong>
<p>[2-3 sentence summary of the entire article's value]</p>
</div>

2. KEY TAKEAWAYS BOX (after TL;DR):
<div class="wp-opt-takeaways">
<strong>🎯 Key Takeaways</strong>
<ul>
<li>✓ [Actionable takeaway 1]</li>
<li>✓ [Actionable takeaway 2]</li>
<li>✓ [Actionable takeaway 3]</li>
<li>✓ [Actionable takeaway 4]</li>
<li>✓ [Actionable takeaway 5]</li>
</ul>
</div>

3. PRO TIP BOXES (use 3-4 throughout):
<div class="wp-opt-tip">
<strong>💡 Pro Tip</strong>
<p>[Insider knowledge or expert advice]</p>
</div>

4. WARNING BOXES (use 1-2 for common mistakes):
<div class="wp-opt-warning">
<strong>⚠️ Warning</strong>
<p>[Common mistake and how to avoid it]</p>
</div>

5. STAT HIGHLIGHT BOXES (use 2-3 with citations):
<div class="wp-opt-stat">
<strong>[XX%] of [audience] [do something]</strong>
<p>Source: [Publication Name, Year]</p>
</div>

6. EXPERT QUOTE BOXES (use 1-2):
<div class="wp-opt-quote">
<blockquote>"[Powerful quote from expert]"</blockquote>
<cite>— [Expert Name], [Title/Company]</cite>
</div>

7. FAQ BOXES (use for each FAQ):
<div class="wp-opt-faq">
<h3>[Question?]</h3>
<p>[Comprehensive answer]</p>
</div>

8. CTA BOXES (use 2-3 strategically):
<div class="wp-opt-cta">
<strong>[Compelling CTA headline]</strong>
<p>[Brief value proposition and call to action]</p>
</div>

9. INTERNAL LINK FORMAT:
<a href="[URL]" class="wp-opt-internal">[Rich anchor text - 3-6 words, descriptive]</a>

═══════════════════════════════════════════════════════════════
📋 CONTENT REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Word count: ${advanced.minWordCount}-${advanced.maxWordCount} words
- Target quality score: ${advanced.targetScore}/100
- Include FAQs: ${advanced.enableFaqs ? 'Yes (5-7 FAQs with comprehensive answers in wp-opt-faq boxes)' : 'No'}
- Include Schema: ${advanced.enableSchema ? 'Yes (Article + FAQ + VideoObject if video provided)' : 'No'}
- Include Internal Links: ${advanced.enableInternalLinks ? 'Yes (EXACTLY 5 contextual links with rich anchor text)' : 'No'}
- Include Table of Contents: ${advanced.enableToc ? 'Yes (as clickable list)' : 'No'}
- Include Key Takeaways: ${advanced.enableKeyTakeaways ? 'Yes (5 bullet summary at top in wp-opt-takeaways box)' : 'No'}
- Include CTAs: ${advanced.enableCtas ? 'Yes (2-3 strategic CTAs in wp-opt-cta boxes)' : 'No'}
- Include YouTube Video: ${youtubeVideo ? 'Yes (USE THE PROVIDED EMBED HTML EXACTLY!)' : 'No'}
- Include References Section: Yes (4-6 sources from provided list or authoritative alternatives)

═══════════════════════════════════════════════════════════════
📚 REFERENCES SECTION FORMAT (REQUIRED AT END!)
═══════════════════════════════════════════════════════════════
At the VERY END of the article (after FAQs if present), add:

<div class="wp-opt-references">
<h2>📚 References & Further Reading</h2>
<p>This article draws from the following authoritative sources:</p>
<ol>
<li><a href="[EXACT_URL_FROM_PROVIDED_LIST]" target="_blank" rel="noopener noreferrer">[Source Title]</a> — [Brief 1-2 sentence description of relevance]</li>
<li><a href="[URL]" target="_blank" rel="noopener noreferrer">[Title]</a> — [Description]</li>
... (include 4-6 total)
</ol>
</div>

${referenceSources.length > 0 ? '✅ USE THE PROVIDED VERIFIED SOURCES ABOVE!' : '⚠️ Find authoritative .gov, .edu, or major publication sources.'}

═══════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (JSON)
═══════════════════════════════════════════════════════════════
Return ONLY valid JSON:
{
  "optimizedTitle": "SEO title under 60 chars with power words",
  "metaDescription": "Compelling 150-160 char meta with CTA",
  "h1": "Main H1 heading",
  "h2s": ["H2 1", "H2 2", ...],
  "optimizedContent": "<article>Full HTML with ALL boxes, ${youtubeVideo ? 'YouTube embed,' : ''} internal links, FAQs, References section</article>",
  "contentStrategy": {
    "wordCount": 2500,
    "readabilityScore": 75,
    "keywordDensity": 1.5,
    "lsiKeywords": ["term1", "term2"],
    "powerWords": ["proven", "exclusive"],
    "hookStrength": 9
  },
  "internalLinks": [{"anchor": "text", "target": "url", "context": "sentence"}],
  "references": [{"title": "Source", "url": "https://...", "snippet": "description"}],
  ${youtubeVideo ? `"youtubeVideo": {"title": "${youtubeVideo.title}", "videoId": "${youtubeVideo.videoId}", "description": "${youtubeVideo.description}"},` : ''}
  "schema": {"@context": "https://schema.org", "@graph": [...]},
  "aiSuggestions": {"contentGaps": "...", "quickWins": "...", "improvements": [], "competitorAdvantages": "..."},
  "qualityScore": 85,
  "estimatedRankPosition": 5,
  "confidenceLevel": 0.8,
  "tableOfContents": ["Section 1", "Section 2"],
  "faqs": [{"question": "...", "answer": "..."}],
  "keyTakeaways": ["Point 1", "Point 2"],
  "stats": [{"stat": "67%", "context": "...", "source": "..."}]
}`;
}

// Convert markdown to HTML
function convertMarkdownToHtml(content: string): string {
  if (!content) return content;
  
  let html = content;
  
  // Convert markdown headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Convert bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Convert markdown links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  return html;
}

// Validate internal links
function validateInternalLinks(content: string, validUrlSet: Set<string>, logger: Logger): string {
  if (!content) return content;
  
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  let invalidCount = 0;
  
  let result = content;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1];
    
    if (href.startsWith('/') || href.startsWith('#')) continue;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (!validUrlSet.has(href)) {
        const slug = href.split('/').pop()?.replace(/\/$/, '') || '';
        if (!validUrlSet.has(slug)) {
          result = result.replace(match[0], `<!-- removed invalid link: ${href} --><span`);
          invalidCount++;
        }
      }
    }
  }
  
  if (invalidCount > 0) {
    logger.warn('Removed invalid internal links', { count: invalidCount });
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA POST-PROCESSING QUALITY ENHANCEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function enhanceContentQuality(content: string, keyword: string, logger: Logger): string {
  if (!content) return content;
  
  let enhanced = content;
  let fluffRemoved = 0;
  
  // Comprehensive list of fluff phrases to remove
  const fluffPatterns = [
    // Generic openers
    /In today's (?:world|digital age|fast-paced environment|modern world|society)[,.]?\s*/gi,
    /In this day and age[,.]?\s*/gi,
    /In the (?:current|modern|digital) (?:landscape|era|age)[,.]?\s*/gi,
    
    // Weak qualifiers
    /It's (?:important|crucial|essential|vital|critical|worth noting|interesting|notable) to (?:note|understand|remember|mention|point out|realize|recognize) that\s*/gi,
    /It (?:should|must|needs to) be (?:noted|mentioned|pointed out|emphasized|stressed) that\s*/gi,
    /It goes without saying (?:that\s*)?/gi,
    
    // Filler transitions
    /When it comes to\s*/gi,
    /At the end of the day[,.]?\s*/gi,
    /In order to\s*/gi,
    /The fact of the matter is[,.]?\s*/gi,
    /Needless to say[,.]?\s*/gi,
    /As you (?:may|might|probably) (?:know|have heard|be aware)[,.]?\s*/gi,
    /As (?:we all|everyone) know[s]?[,.]?\s*/gi,
    /For all intents and purposes[,.]?\s*/gi,
    /At this point in time[,.]?\s*/gi,
    /First and foremost[,.]?\s*/gi,
    /Last but not least[,.]?\s*/gi,
    /All things considered[,.]?\s*/gi,
    /By and large[,.]?\s*/gi,
    /More often than not[,.]?\s*/gi,
    
    // Weak conclusions
    /In conclusion[,.]?\s*/gi,
    /To (?:sum up|summarize|conclude|wrap up)[,.]?\s*/gi,
    /All in all[,.]?\s*/gi,
    /To put it simply[,.]?\s*/gi,
    /Simply put[,.]?\s*/gi,
    /The bottom line is[,.]?\s*/gi,
    
    // Hedging language
    /(?:I|We) (?:think|believe|feel) that\s*/gi,
    /In my (?:opinion|view|experience)[,.]?\s*/gi,
    /It (?:seems|appears) (?:that|like)\s*/gi,
    /(?:Basically|Essentially|Fundamentally)[,.]?\s*/gi,
    /(?:Honestly|Frankly|Truthfully) speaking[,.]?\s*/gi,
    
    // Redundant phrases
    /(?:Very|Really|Extremely|Incredibly|Absolutely) (?:unique|important|essential|crucial)/gi,
    /Each and every\s*/gi,
    /One of the most\s*/gi,
    /The vast majority of\s*/gi,
    /A large number of\s*/gi,
    /Due to the fact that\s*/gi,
    /In spite of the fact that\s*/gi,
    /For the purpose of\s*/gi,
    /In the event that\s*/gi,
    /With regard to\s*/gi,
    /In reference to\s*/gi,
    /Pertaining to\s*/gi,
  ];
  
  fluffPatterns.forEach(pattern => {
    const before = enhanced.length;
    enhanced = enhanced.replace(pattern, '');
    if (enhanced.length < before) fluffRemoved++;
  });
  
  // Fix double spaces created by removals
  enhanced = enhanced.replace(/\s{2,}/g, ' ');
  enhanced = enhanced.replace(/\s+([.,;:!?])/g, '$1');
  enhanced = enhanced.replace(/\.\s*\./g, '.');
  
  // Ensure keyword appears in first 100 characters (for featured snippets)
  const first150 = enhanced.substring(0, 150).toLowerCase();
  const keywordLower = keyword.toLowerCase();
  if (!first150.includes(keywordLower)) {
    logger.warn('Primary keyword missing from opening - content may not rank optimally', { keyword });
  }
  
  // Check for TL;DR presence
  const hasQuickSummary = enhanced.toLowerCase().includes('tl;dr') || 
                          enhanced.toLowerCase().includes('tldr') ||
                          enhanced.toLowerCase().includes('key takeaway') ||
                          enhanced.includes('wp-opt-tldr') ||
                          enhanced.includes('wp-opt-takeaways');
  
  if (!hasQuickSummary) {
    logger.warn('No TL;DR or Key Takeaways section found - adding may improve engagement');
  }
  
  // Verify minimum visual elements
  const tipBoxes = (enhanced.match(/wp-opt-tip/g) || []).length;
  const statBoxes = (enhanced.match(/wp-opt-stat/g) || []).length;
  const ctaBoxes = (enhanced.match(/wp-opt-cta/g) || []).length;
  
  if (tipBoxes < 2) {
    logger.warn('Fewer than 2 Pro Tip boxes - consider adding more for engagement');
  }
  
  if (fluffRemoved > 0) {
    logger.info('Content quality enhanced', { 
      fluffPhrasesRemoved: fluffRemoved,
      tipBoxes,
      statBoxes,
      ctaBoxes,
      hasQuickSummary
    });
  }
  
  return enhanced;
}

// JSON repair helpers
const escapeNewlinesInJsonStrings = (s: string): string => {
  let inString = false;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
    }
    if (inString && c === '\n') {
      out += '\\n';
    } else if (inString && c === '\r') {
      // skip
    } else {
      out += c;
    }
  }
  return out;
};

const repairJsonStringForParsing = (raw: string): string => {
  let s = raw.replace(/\r/g, '');
  s = s.replace(/="([^"]*)"/g, "='$1'");
  s = escapeNewlinesInJsonStrings(s);
  return s;
};

// ============================================================
// BACKGROUND JOB PROCESSOR
// ============================================================
async function processOptimizationJob(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  serperApiKey: string | undefined,
  lovableApiKey: string | undefined,
  jobId: string,
  pageId: string,
  request: OptimizeRequest,
  logger: Logger
) {
  const { siteUrl, username, applicationPassword, targetKeyword, language, aiConfig, neuronWriter, advanced, siteContext } = request;
  
  const effectiveAdvanced: AdvancedSettings = {
    targetScore: advanced?.targetScore ?? 85,
    minWordCount: advanced?.minWordCount ?? 2000,
    maxWordCount: advanced?.maxWordCount ?? 3000,
    enableFaqs: advanced?.enableFaqs ?? true,
    enableSchema: advanced?.enableSchema ?? true,
    enableInternalLinks: advanced?.enableInternalLinks ?? true,
    enableToc: advanced?.enableToc ?? true,
    enableKeyTakeaways: advanced?.enableKeyTakeaways ?? true,
    enableCtas: advanced?.enableCtas ?? true,
  };

  try {
    const useUserAI = aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model;
    
    if (!useUserAI && !lovableApiKey) {
      throw new Error('No AI provider configured.');
    }

    // Fetch page data
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError || !pageData) {
      throw new Error('Page not found in database');
    }

    // Fetch internal link candidates
    await updateJobProgress(supabase, jobId, 'fetching_sitemap_pages', 15, logger);
    
    const { data: allPages } = await supabase
      .from('pages')
      .select('url, slug, title')
      .neq('id', pageId)
      .limit(200);

    // CRITICAL: Normalize all internal link URLs to be absolute (fixes broken links)
    // Use the site URL from WordPress config to ensure proper domain prefix
    let siteBaseUrl = siteUrl.trim();
    if (!siteBaseUrl.startsWith('http://') && !siteBaseUrl.startsWith('https://')) {
      siteBaseUrl = 'https://' + siteBaseUrl;
    }
    siteBaseUrl = siteBaseUrl.replace(/\/+$/, ''); // Remove trailing slashes

    const internalLinkCandidates: InternalLinkCandidate[] = (allPages || []).map((p: any) => ({
      // Normalize URL to be absolute - prepend siteBaseUrl if relative
      url: (p.url && !p.url.startsWith('http://') && !p.url.startsWith('https://')) 
        ? siteBaseUrl + (p.url.startsWith('/') ? p.url : '/' + p.url)
        : (p.url || ''),
      slug: p.slug,
      title: p.title,
    }));

    const validUrlSet = new Set(internalLinkCandidates.map(l => l.url));
    internalLinkCandidates.forEach(l => validUrlSet.add(l.slug));

    logger.info('Fetched internal link candidates', { count: internalLinkCandidates.length });

    await updateJobProgress(supabase, jobId, 'fetching_wordpress', 20, logger);

    // Fetch WordPress content
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);
    
    let pageContent = '';
    let pageTitle = pageData.title;

    if (pageData.post_id) {
      try {
        const wpResponse = await withRetry(
          () => fetch(
            `${normalizedUrl}/wp-json/wp/v2/posts/${pageData.post_id}?context=edit`,
            {
              headers: {
                'Accept': 'application/json',
                'Authorization': authHeader,
                'User-Agent': 'WP-Optimizer-Pro/1.0',
              },
            }
          ),
          { maxRetries: 2, initialDelayMs: 500, retryableStatuses: [408, 429, 500, 502, 503, 504] }
        );

        if (wpResponse.ok) {
          const wpData = await wpResponse.json();
          pageContent = wpData.content?.raw || wpData.content?.rendered || '';
          pageTitle = wpData.title?.raw || wpData.title?.rendered || pageTitle;
          logger.info('Fetched WP content', { chars: pageContent.length });
        }
      } catch (e) {
        logger.warn('Could not fetch WP content', { error: e instanceof Error ? e.message : 'Unknown' });
      }
    }

    // Derive keyword
    const effectiveKeyword = targetKeyword || deriveKeyword(pageTitle, pageData.slug);
    logger.info('Using keyword', { keyword: effectiveKeyword });

    // Fetch SERP data for competitive intelligence
    await updateJobProgress(supabase, jobId, 'analyzing_serp', 25, logger);
    
    let serpData: SerpData | undefined;
    if (serperApiKey) {
      try {
        const serpResponse = await fetch(`${supabaseUrl}/functions/v1/serp-analysis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            query: effectiveKeyword,
            gl: request.region || 'us',
            hl: language || 'en',
            serperApiKey: serperApiKey,
          }),
        });
        
        if (serpResponse.ok) {
          const serpResult = await serpResponse.json();
          if (serpResult.success) {
            serpData = {
              organic: serpResult.organic,
              peopleAlsoAsk: serpResult.peopleAlsoAsk,
              relatedSearches: serpResult.relatedSearches,
            };
            logger.info('SERP data fetched for competitive intelligence', { 
              organicResults: serpData.organic?.length || 0,
              paaQuestions: serpData.peopleAlsoAsk?.length || 0,
              relatedSearches: serpData.relatedSearches?.length || 0
            });
          }
        }
      } catch (serpError) {
        logger.warn('Could not fetch SERP data', { error: serpError instanceof Error ? serpError.message : 'Unknown' });
      }
    }

    // Fetch NeuronWriter recommendations
    await updateJobProgress(supabase, jobId, 'fetching_neuronwriter', 30, logger);
    
    let neuronWriterData: NeuronWriterRecommendations | null = null;
    if (neuronWriter?.enabled && neuronWriter?.apiKey && neuronWriter?.projectId) {
      neuronWriterData = await fetchNeuronWriterRecommendations(
        supabaseUrl,
        supabaseKey,
        neuronWriter,
        effectiveKeyword,
        language || 'English',
        logger,
        jobId,
        supabase
      );
    }

    // Discover YouTube video
    await updateJobProgress(supabase, jobId, 'discovering_youtube_video', 35, logger);
    const youtubeVideo = await discoverYouTubeVideo(
      supabaseUrl,
      supabaseKey,
      effectiveKeyword,
      pageContent,
      serperApiKey,
      logger
    );

    // Find reference sources
    await updateJobProgress(supabase, jobId, 'finding_references', 38, logger);
    let referenceSources: ReferenceSource[] = [];
    if (serperApiKey) {
      referenceSources = await findReferenceSources(serperApiKey, effectiveKeyword, logger);
    } else {
      logger.warn('SERPER_API_KEY not configured - references will be AI-generated');
    }

    await updateJobProgress(supabase, jobId, 'analyzing_content', 42, logger);

    // Build prompt with competitive intelligence
    const userPrompt = buildOptimizationPrompt(
      pageTitle,
      pageContent,
      effectiveKeyword,
      internalLinkCandidates,
      neuronWriterData,
      youtubeVideo,
      referenceSources,
      effectiveAdvanced,
      siteContext,
      serpData
    );

    await updateJobProgress(supabase, jobId, 'generating_content', 50, logger);

    // Build AI request with SOTA parameters
    const messages = [
      { role: 'system', content: OPTIMIZATION_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    interface AIRequest {
      url: string;
      headers: Record<string, string>;
      body: string;
    }

    const buildAIRequest = (): AIRequest => {
      if (useUserAI && aiConfig) {
        const { provider, apiKey, model } = aiConfig;
        
        switch (provider) {
          case 'google':
            return {
              url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${OPTIMIZATION_PROMPT}\n\n${userPrompt}` }] }],
                generationConfig: { 
                  temperature: 0.3,  // SOTA: Lower temperature for more focused output
                  maxOutputTokens: 32000 
                },
              }),
            };

          case 'openai':
            return {
              url: 'https://api.openai.com/v1/chat/completions',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ 
                model, 
                messages, 
                temperature: 0.3,           // SOTA: Lower temperature for factual accuracy
                top_p: 0.9,                 // SOTA: Nucleus sampling for coherence
                frequency_penalty: 0.5,     // SOTA: Reduce repetition
                presence_penalty: 0.3,      // SOTA: Encourage topic diversity
                max_tokens: 32000 
              }),
            };

          case 'anthropic':
            return {
              url: 'https://api.anthropic.com/v1/messages',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({ 
                model, 
                system: OPTIMIZATION_PROMPT, 
                messages: [{ role: 'user', content: userPrompt }], 
                max_tokens: 32000,
                temperature: 0.3  // SOTA: Lower temperature
              }),
            };

          case 'groq':
            return {
              url: 'https://api.groq.com/openai/v1/chat/completions',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ 
                model, 
                messages, 
                temperature: 0.3,           // SOTA: Lower temperature
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.3,
                max_tokens: 32000 
              }),
            };

          case 'openrouter':
            return {
              url: 'https://openrouter.ai/api/v1/chat/completions',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://wp-optimizer-pro.lovable.app',
                'X-Title': 'WP Optimizer Pro',
              },
              body: JSON.stringify({ 
                model, 
                messages, 
                temperature: 0.3,           // SOTA: Lower temperature
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.3,
                max_tokens: 32000 
              }),
            };

          default:
            throw new Error(`Unsupported AI provider: ${provider}`);
        }
      }

      // Default Lovable gateway with SOTA parameters
      return {
        url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableApiKey}` },
        body: JSON.stringify({ 
          model: 'google/gemini-2.5-flash', 
          messages, 
          temperature: 0.3,           // SOTA: Lower temperature
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          max_tokens: 32000 
        }),
      };
    };

    const aiRequest = buildAIRequest();

    // Call AI with 180 second timeout
    const aiController = new AbortController();
    const aiTimeoutId = setTimeout(() => aiController.abort(), 180000);

    let aiResponse: Response;
    try {
      aiResponse = await withRetry(
        () => fetch(aiRequest.url, {
          method: 'POST',
          headers: aiRequest.headers,
          body: aiRequest.body,
          signal: aiController.signal,
        }),
        { maxRetries: 2, initialDelayMs: 2000, retryableStatuses: [429, 500, 502, 503, 504] }
      );
      clearTimeout(aiTimeoutId);
    } catch (aiErr) {
      clearTimeout(aiTimeoutId);
      if (aiErr instanceof Error && aiErr.name === 'AbortError') {
        throw new Error('AI request timed out after 180 seconds');
      }
      throw aiErr;
    }

    await updateJobProgress(supabase, jobId, 'processing_response', 80, logger);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('AI error', { status: aiResponse.status, body: errorText.substring(0, 500) });
      
      if (aiResponse.status === 429) {
        throw new Error('Too many requests. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Please add credits to your Lovable workspace.');
      }
      
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    let aiContent: string | undefined;
    if (useUserAI && aiConfig?.provider === 'google') {
      aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (useUserAI && aiConfig?.provider === 'anthropic') {
      aiContent = aiData.content?.[0]?.text;
    } else {
      aiContent = aiData.choices?.[0]?.message?.content;
    }

    if (!aiContent) {
      throw new Error('No response from AI');
    }

    logger.info('AI response received', { contentLength: aiContent.length });

    // Parse JSON response
    let jsonStr = aiContent;
    const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const firstBrace = aiContent.indexOf('{');
      const lastBrace = aiContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = aiContent.substring(firstBrace, lastBrace + 1);
      }
    }

    jsonStr = repairJsonStringForParsing(jsonStr);

// SOTA: Enterprise-grade JSON parsing with multiple fallback strategies
    let optimization: Record<string, unknown>;
    
    // Strategy 1: Direct parse after repair
    try {
      optimization = JSON.parse(jsonStr);
    } catch (parseErr1) {
      logger.warn('Initial JSON parse failed, trying fallback strategies', { 
        error: parseErr1 instanceof Error ? parseErr1.message : 'Unknown',
        jsonLength: jsonStr?.length || 0
      });
      
      // Strategy 2: Try to extract JSON from markdown code blocks
      const codeBlockMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          optimization = JSON.parse(codeBlockMatch[1].trim());
          logger.info('Successfully parsed JSON from code block');
        } catch (parseErr2) {
          logger.warn('Code block JSON parse also failed');
        }
      }
      
      // Strategy 3: Try to find and parse JSON object pattern
      if (!optimization) {
        const jsonObjectMatch = aiContent.match(/\{[\s\S]*"optimizedTitle"[\s\S]*"optimizedContent"[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            let cleanJson = jsonObjectMatch[0]
              .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters
              .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
            optimization = JSON.parse(cleanJson);
            logger.info('Successfully parsed JSON from pattern match');
          } catch (parseErr3) {
            logger.warn('Pattern match JSON parse also failed');
          }
        }
      }
      
      // Strategy 4: Create fallback optimization from raw content
      if (!optimization) {
        logger.warn('All JSON parse strategies failed, creating fallback from raw AI content');
        
        // Try to extract content between common markers
        const titleMatch = aiContent.match(/["']?optimizedTitle["']?\s*[:"]\s*["']?([^"'\n]+)["']?/i);
        const contentMatch = aiContent.match(/["']?optimizedContent["']?\s*[:"]\s*["']?([\s\S]+?)(?=["']?(?:metaDescription|h1|h2s|contentStrategy)["']?\s*[:"]|$)/i);
        const metaMatch = aiContent.match(/["']?metaDescription["']?\s*[:"]\s*["']?([^"'\n]+)["']?/i);
        
        optimization = {
          optimizedTitle: titleMatch ? titleMatch[1].trim() : (body.title || 'Untitled'),
          metaDescription: metaMatch ? metaMatch[1].trim() : (body.metaDescription || ''),
          h1: body.title || 'Untitled',
          h2s: [],
          optimizedContent: contentMatch ? contentMatch[1].trim() : aiContent,
          contentStrategy: 'Fallback: AI response could not be parsed as structured JSON. Raw content preserved.',
          references: [],
          internalLinks: []
        };
        
        logger.info('Created fallback optimization object', {
          hasTitle: !!titleMatch,
          hasContent: !!contentMatch,
          hasMeta: !!metaMatch,
          contentLength: optimization.optimizedContent?.toString().length || 0
        });
      }
    }
    // Validate required fields
    const requiredFields = ['optimizedTitle', 'metaDescription', 'h1', 'h2s', 'optimizedContent', 'contentStrategy', 'qualityScore'];
    for (const field of requiredFields) {
      if (!optimization[field]) {
        throw new Error(`AI response missing field: ${field}`);
      }
    }

    await updateJobProgress(supabase, jobId, 'validating_content', 85, logger);

    // Post-process content: Convert markdown and validate links
    optimization.optimizedContent = convertMarkdownToHtml(optimization.optimizedContent as string);
    optimization.optimizedContent = validateInternalLinks(optimization.optimizedContent as string, validUrlSet, logger);

    // SOTA: Apply quality enhancement post-processing
    await updateJobProgress(supabase, jobId, 'enhancing_quality', 90, logger);
    optimization.optimizedContent = enhanceContentQuality(
      optimization.optimizedContent as string, 
      effectiveKeyword, 
      logger
    );

    // Validate content length
    const contentLength = (optimization.optimizedContent as string)?.length || 0;
    if (contentLength < 3000) {
      throw new Error(`Content too short (${contentLength} chars)`);
    }

    // Add video schema if video was provided
    if (youtubeVideo && optimization.schema) {
      const schema = optimization.schema as any;
      if (schema['@graph'] && Array.isArray(schema['@graph'])) {
        schema['@graph'].push(youtubeVideo.schema);
      }
    }

    // CRITICAL: Ensure references have verified URLs from serper.dev
    // Override AI-generated references with verified sources to ensure links work
    if (referenceSources.length > 0) {
      optimization.references = referenceSources.map(ref => ({
        title: ref.title,
        url: ref.url,
        snippet: ref.snippet
      }));
      logger.info('Set verified references from serper.dev', { count: referenceSources.length });
    } else if (!optimization.references || (optimization.references as unknown[]).length === 0) {
      logger.warn('No references available - AI did not generate any and serper.dev not configured');
    }

    // Add competitive intelligence metadata
    if (serpData) {
      optimization.competitiveIntelligence = {
        analyzedCompetitors: serpData.organic?.length || 0,
        paaQuestionsFound: serpData.peopleAlsoAsk?.length || 0,
        relatedSearchesFound: serpData.relatedSearches?.length || 0,
      };
    }

    logger.info('Content validated and enhanced', { 
      contentLength, 
      wordCount: (optimization.contentStrategy as Record<string, unknown>)?.wordCount,
      qualityScore: optimization.qualityScore,
      hasYouTubeVideo: !!youtubeVideo,
      referencesFound: referenceSources.length,
      hasCompetitiveIntelligence: !!serpData,
    });

    // Mark job completed
    await supabase.from('jobs').update({
      status: 'completed',
      current_step: 'optimization_complete',
      progress: 100,
      completed_at: new Date().toISOString(),
      result: optimization,
      ai_tokens_used: aiData.usage?.total_tokens || 0,
    }).eq('id', jobId);

    // Update page
    const scoreAfter = {
      overall: optimization.qualityScore || 75,
      title: optimization.optimizedTitle ? 90 : 50,
      meta: optimization.metaDescription ? 90 : 50,
      headings: (optimization.h2s as string[])?.length > 0 ? 85 : 50,
      content: (optimization.contentStrategy as Record<string, unknown>)?.readabilityScore || 60,
    };

    await supabase.from('pages').update({
      status: 'completed',
      score_after: scoreAfter,
      word_count: (optimization.contentStrategy as Record<string, unknown>)?.wordCount || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', pageId);

    // Log activity
    await supabase.from('activity_log').insert({
      page_id: pageId,
      job_id: jobId,
      type: 'success',
      message: `Optimized: ${(optimization.contentStrategy as Record<string, unknown>)?.wordCount || 0} words, score ${optimization.qualityScore}${youtubeVideo ? ', video included' : ''}${serpData ? ', competitor analysis applied' : ''}`,
      details: {
        qualityScore: optimization.qualityScore,
        wordCount: (optimization.contentStrategy as Record<string, unknown>)?.wordCount,
        internalLinks: (optimization.internalLinks as unknown[])?.length,
        usedNeuronWriter: !!neuronWriterData,
        youtubeVideoId: youtubeVideo?.videoId,
        referencesCount: referenceSources.length,
        competitorsAnalyzed: serpData?.organic?.length || 0,
        requestId: logger.getRequestId(),
      },
    });

    logger.info('Optimization complete', { 
      qualityScore: optimization.qualityScore,
      youtubeIncluded: !!youtubeVideo,
      referencesIncluded: referenceSources.length,
      competitiveIntelligenceApplied: !!serpData,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markJobFailed(supabase, jobId, pageId, errorMessage, logger);
  }
}

// ============================================================
// MAIN SERVER
// ============================================================
serve(async (req) => {
  const logger = new Logger('optimize-content');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const envSerperApiKey = Deno.env.get('SERPER_API_KEY'); 
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: OptimizeRequest = await req.json();
    const { pageId, siteUrl, username, applicationPassword } = body;

    // Use serperApiKey from request body (aiConfig) if provided, otherwise fallback to env var
    const serperApiKey = body.aiConfig?.serperApiKey || envSerperApiKey;

    validateRequired(body as unknown as Record<string, unknown>, ['pageId', 'siteUrl', 'username', 'applicationPassword']);

    logger.info('Received optimization request', { pageId, siteUrl });

    // Check if SERPER_API_KEY is configured
    if (!serperApiKey) {
      logger.warn('SERPER_API_KEY not configured - YouTube videos, references, and competitive intelligence will be limited');
    }

    // Rate limiting
    const rateLimitKey = `optimize:${siteUrl}`;
    const rateLimit = checkRateLimit(rateLimitKey, 10, 60000);
    if (!rateLimit.allowed) {
      throw new AppError(
        `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // Check AI config
    const useUserAI = body.aiConfig?.provider && body.aiConfig?.apiKey && body.aiConfig?.model;
    if (!useUserAI && !lovableApiKey) {
      throw new AppError('No AI provider configured.', 'AI_NOT_CONFIGURED', 500);
    }

    // Verify page exists before creating job (FK constraint)
    const { data: existingPage, error: pageCheckError } = await supabase
      .from('pages')
      .select('id, status')
      .eq('id', pageId)
      .single();

    if (pageCheckError || !existingPage) {
      throw new AppError(
        'Page not found. It may have been deleted during a sitemap refresh. Please refresh the page list.',
        'PAGE_NOT_FOUND',
        404
      );
    }

    // Prevent re-optimization of already running jobs
    if (existingPage.status === 'optimizing') {
      throw new AppError(
        'This page is already being optimized. Please wait for the current job to complete.',
        'ALREADY_OPTIMIZING',
        409
      );
    }

    // Update page status immediately
    const { error: pageUpdateError } = await supabase
      .from('pages')
      .update({ status: 'optimizing' })
      .eq('id', pageId);

    if (pageUpdateError) {
      logger.warn('Failed to update page status', { error: pageUpdateError.message });
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        page_id: pageId,
        status: 'running',
        current_step: 'queued',
        progress: 5,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError || !job) {
      // Revert page status on job creation failure
      await supabase.from('pages').update({ status: 'pending' }).eq('id', pageId);
      throw new AppError(
        `Failed to create job: ${jobError?.message || 'Unknown error'}`,
        'JOB_CREATE_FAILED',
        500
      );
    }

    const jobId = job.id;
    logger.info('Job created, starting background processing', { 
      jobId, 
      hasSerperKey: !!serperApiKey,
      features: {
        competitiveIntelligence: !!serperApiKey,
        youtubeDiscovery: !!serperApiKey,
        referenceFinding: !!serperApiKey,
        sotaPrompt: true,
        qualityEnhancement: true,
      }
    });

    // ========================================================
    // RESPOND IMMEDIATELY - Run actual work in background
    // ========================================================
    // @ts-ignore - EdgeRuntime.waitUntil is a Deno Deploy feature
    EdgeRuntime.waitUntil(
      processOptimizationJob(
        supabase,
        supabaseUrl,
        supabaseKey,
        serperApiKey,
        lovableApiKey,
        jobId,
        pageId,
        body,
        logger
      )
    );

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Optimization job started with SOTA enhancements', 
        jobId,
        requestId: logger.getRequestId(),
        features: {
          sotaPrompt: true,
          competitiveIntelligence: !!serperApiKey,
          youtubeDiscovery: !!serperApiKey,
          referenceFinding: !!serperApiKey,
          qualityEnhancement: true,
          lowTemperature: true,
        }
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Request failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
