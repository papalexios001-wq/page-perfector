import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Logger, corsHeaders, AppError, createErrorResponse, validateRequired } from "../_shared/utils.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE-GRADE TF-IDF INTERNAL LINKING ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This engine uses TF-IDF (Term Frequency-Inverse Document Frequency) scoring
 * to intelligently find the most semantically relevant internal links for content.
 * 
 * Features:
 * - TF-IDF scoring for semantic relevance
 * - Anchor text optimization with rich, descriptive phrases
 * - Balanced link distribution (no link stuffing)
 * - Category/tag matching boost
 * - Prevents duplicate anchors and self-linking
 */

interface LinkCandidate {
  id: string;
  url: string;
  slug: string;
  title: string;
  categories?: string[];
  tags?: string[];
  post_type?: string;
}

interface ScoredLink {
  url: string;
  title: string;
  anchor: string;
  score: number;
  matchedTerms: string[];
  position: 'early' | 'middle' | 'late';
}

interface InternalLinkRequest {
  content: string;
  pageId: string;
  targetKeyword: string;
  maxLinks?: number;
  siteUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TF-IDF IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2) // Filter short words
    .filter(word => !STOP_WORDS.has(word));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
  'their', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'your', 'you', 'our', 'we', 'my', 'i', 'me', 'he', 'she', 'him', 'her', 'his',
]);

function calculateTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const total = tokens.length;
  
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  
  // Normalize by document length
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  
  return tf;
}

function calculateIDF(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const N = documents.length;
  
  // Count document frequency for each term
  const df = new Map<string, number>();
  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }
  
  // Calculate IDF
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  
  return idf;
}

function calculateTFIDF(
  contentTokens: string[],
  candidateTokens: string[],
  idf: Map<string, number>
): { score: number; matchedTerms: string[] } {
  const contentTF = calculateTF(contentTokens);
  const candidateTF = calculateTF(candidateTokens);
  
  let score = 0;
  const matchedTerms: string[] = [];
  
  // Find overlapping terms and calculate cosine similarity
  for (const [term, contentWeight] of contentTF) {
    if (candidateTF.has(term)) {
      const candidateWeight = candidateTF.get(term)!;
      const idfWeight = idf.get(term) || 1;
      score += contentWeight * candidateWeight * idfWeight * idfWeight;
      matchedTerms.push(term);
    }
  }
  
  return { score, matchedTerms };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANCHOR TEXT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateRichAnchor(title: string, matchedTerms: string[], targetKeyword: string): string {
  // Clean the title
  let anchor = title
    .replace(/\s*[-|–—]\s*.*$/, '') // Remove site name suffix
    .replace(/[^\w\s,:']/g, '')
    .trim();
  
  // If title is too long, try to create a shorter, keyword-rich anchor
  if (anchor.length > 50) {
    // Try to find a phrase containing matched terms
    const words = anchor.split(' ');
    const keywordWords = targetKeyword.toLowerCase().split(' ');
    
    // Look for segments that contain important terms
    let bestSegment = '';
    let bestScore = 0;
    
    for (let i = 0; i < words.length; i++) {
      for (let len = 3; len <= 6 && i + len <= words.length; len++) {
        const segment = words.slice(i, i + len).join(' ');
        const segmentLower = segment.toLowerCase();
        
        let segmentScore = 0;
        for (const term of matchedTerms) {
          if (segmentLower.includes(term)) segmentScore += 2;
        }
        for (const kw of keywordWords) {
          if (segmentLower.includes(kw)) segmentScore += 3;
        }
        
        if (segmentScore > bestScore) {
          bestScore = segmentScore;
          bestSegment = segment;
        }
      }
    }
    
    if (bestSegment && bestScore > 0) {
      anchor = bestSegment;
    } else {
      // Fall back to first 5-6 meaningful words
      anchor = words.slice(0, 6).join(' ');
    }
  }
  
  return anchor;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINK PLACEMENT OPTIMIZER
// ═══════════════════════════════════════════════════════════════════════════════

function determineLinkPosition(index: number, total: number): 'early' | 'middle' | 'late' {
  const position = index / total;
  if (position < 0.33) return 'early';
  if (position < 0.66) return 'middle';
  return 'late';
}

function selectOptimalLinks(
  scoredLinks: ScoredLink[],
  maxLinks: number
): ScoredLink[] {
  // Sort by score descending
  const sorted = [...scoredLinks].sort((a, b) => b.score - a.score);
  
  const selected: ScoredLink[] = [];
  const usedAnchors = new Set<string>();
  const positionCounts = { early: 0, middle: 0, late: 0 };
  const maxPerPosition = Math.ceil(maxLinks / 3);
  
  for (const link of sorted) {
    if (selected.length >= maxLinks) break;
    
    // Skip duplicate anchors
    const anchorLower = link.anchor.toLowerCase();
    if (usedAnchors.has(anchorLower)) continue;
    
    // Balance positions (don't put all links in one section)
    if (positionCounts[link.position] >= maxPerPosition + 1) continue;
    
    selected.push(link);
    usedAnchors.add(anchorLower);
    positionCounts[link.position]++;
  }
  
  return selected;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT INSERTION
// ═══════════════════════════════════════════════════════════════════════════════

function insertLinksIntoContent(
  content: string,
  links: ScoredLink[],
  logger: Logger
): string {
  let result = content;
  let insertedCount = 0;
  
  // Split content into paragraphs for insertion
  const paragraphs = result.split(/<\/p>/i);
  const totalParagraphs = paragraphs.length;
  
  // Distribute links across content
  const earlyLinks = links.filter(l => l.position === 'early');
  const middleLinks = links.filter(l => l.position === 'middle');
  const lateLinks = links.filter(l => l.position === 'late');
  
  // Insert links at appropriate positions
  const linksByPosition: ScoredLink[][] = [earlyLinks, middleLinks, lateLinks];
  const positionRanges = [
    [0, Math.floor(totalParagraphs / 3)],
    [Math.floor(totalParagraphs / 3), Math.floor(2 * totalParagraphs / 3)],
    [Math.floor(2 * totalParagraphs / 3), totalParagraphs]
  ];
  
  for (let i = 0; i < 3; i++) {
    const positionLinks = linksByPosition[i];
    const [start, end] = positionRanges[i];
    
    for (const link of positionLinks) {
      // Find a good place to insert the link
      const linkHtml = `<a href="${link.url}" class="wp-opt-internal" title="${link.title}">${link.anchor}</a>`;
      
      // Try to find the anchor text naturally in content within this section
      const anchorWords = link.anchor.toLowerCase().split(' ');
      let inserted = false;
      
      for (let p = start; p < end && !inserted; p++) {
        const paragraph = paragraphs[p];
        if (!paragraph) continue;
        
        // Check if any anchor words appear in this paragraph (not already linked)
        const paragraphLower = paragraph.toLowerCase();
        
        // Don't insert into paragraphs that already have links
        if (/<a\s+[^>]*href/i.test(paragraph)) continue;
        
        // Try to find a natural insertion point
        for (const word of anchorWords) {
          if (word.length < 4) continue;
          
          const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
          if (wordRegex.test(paragraph) && !/<a[^>]*>[^<]*${word}/i.test(paragraph)) {
            // Insert a contextual link after this paragraph
            paragraphs[p] = paragraph + ` ${linkHtml}`;
            inserted = true;
            insertedCount++;
            break;
          }
        }
      }
      
      // If no natural place found, append to a paragraph in the range
      if (!inserted && start < paragraphs.length) {
        const targetIdx = Math.min(start + Math.floor((end - start) / 2), paragraphs.length - 1);
        if (paragraphs[targetIdx] && !/<a\s+[^>]*href/i.test(paragraphs[targetIdx])) {
          paragraphs[targetIdx] += ` Read more: ${linkHtml}`;
          insertedCount++;
        }
      }
    }
  }
  
  result = paragraphs.join('</p>');
  
  logger.info('Links inserted into content', { requested: links.length, inserted: insertedCount });
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const logger = new Logger('internal-linking-engine');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const body: InternalLinkRequest = await req.json();
    const { content, pageId, targetKeyword, maxLinks = 5, siteUrl } = body;
    
    validateRequired(body as unknown as Record<string, unknown>, ['content', 'pageId', 'targetKeyword']);
    
    logger.info('Processing internal linking request', { pageId, targetKeyword, maxLinks });
    
    // Fetch all candidate pages
    const { data: candidates, error: candidatesError } = await supabase
      .from('pages')
      .select('id, url, slug, title, categories, tags, post_type')
      .neq('id', pageId)
      .eq('status', 'completed')
      .limit(500);
    
    if (candidatesError) {
      throw new AppError('Failed to fetch link candidates', 'DB_ERROR', 500);
    }
    
    if (!candidates || candidates.length === 0) {
      logger.info('No link candidates found');
      return new Response(
        JSON.stringify({ success: true, links: [], content }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    logger.info('Fetched link candidates', { count: candidates.length });
    
    // Tokenize content
    const contentTokens = tokenize(content);
    const keywordTokens = tokenize(targetKeyword);
    
    // Tokenize all candidates
    const candidateDocuments = candidates.map(c => 
      tokenize(`${c.title} ${c.slug.replace(/-/g, ' ')} ${(c.categories || []).join(' ')} ${(c.tags || []).join(' ')}`)
    );
    
    // Calculate IDF across all documents
    const allDocuments = [contentTokens, ...candidateDocuments];
    const idf = calculateIDF(allDocuments);
    
    // Score each candidate
    const scoredLinks: ScoredLink[] = [];
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidateTokens = candidateDocuments[i];
      
      const { score, matchedTerms } = calculateTFIDF(contentTokens, candidateTokens, idf);
      
      // Boost score for keyword matches
      let boostedScore = score;
      for (const kwToken of keywordTokens) {
        if (candidateTokens.includes(kwToken)) {
          boostedScore *= 1.5;
        }
      }
      
      // Boost for category/tag matches
      const candidateCategories = (candidate.categories || []).map((c: string) => c.toLowerCase());
      const candidateTags = (candidate.tags || []).map((t: string) => t.toLowerCase());
      const keywordLower = targetKeyword.toLowerCase();
      
      if (candidateCategories.some((c: string) => keywordLower.includes(c))) {
        boostedScore *= 1.3;
      }
      if (candidateTags.some((t: string) => keywordLower.includes(t))) {
        boostedScore *= 1.2;
      }
      
      if (boostedScore > 0.001) { // Threshold for relevance
        const position = determineLinkPosition(i, candidates.length);
        const anchor = generateRichAnchor(candidate.title, matchedTerms, targetKeyword);
        
        scoredLinks.push({
          url: candidate.url,
          title: candidate.title,
          anchor,
          score: boostedScore,
          matchedTerms,
          position,
        });
      }
    }
    
    logger.info('Scored links', { 
      total: candidates.length, 
      relevant: scoredLinks.length,
      topScore: scoredLinks[0]?.score 
    });
    
    // Select optimal links
    const selectedLinks = selectOptimalLinks(scoredLinks, maxLinks);
    
    // Insert links into content
    const enhancedContent = insertLinksIntoContent(content, selectedLinks, logger);
    
    const response = {
      success: true,
      links: selectedLinks.map(l => ({
        url: l.url,
        anchor: l.anchor,
        title: l.title,
        score: l.score,
        position: l.position,
      })),
      content: enhancedContent,
      stats: {
        candidatesAnalyzed: candidates.length,
        linksInserted: selectedLinks.length,
        avgRelevanceScore: selectedLinks.reduce((sum, l) => sum + l.score, 0) / (selectedLinks.length || 1),
      }
    };
    
    logger.info('Internal linking complete', { linksInserted: selectedLinks.length });
    
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('Internal linking error', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
