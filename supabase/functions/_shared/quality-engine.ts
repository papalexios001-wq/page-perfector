/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE CONTENT QUALITY ENGINE v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * State-of-the-art content quality enhancement system designed for:
 * - E-E-A-T optimization (Experience, Expertise, Authoritativeness, Trust)
 * - AI Overview / SGE optimization
 * - Featured snippet capture
 * - Voice search optimization
 * - Semantic richness enhancement
 * 
 * @author WP Optimizer Pro Team
 * @version 2.0.0
 * @license MIT
 */

import { Logger } from "./utils.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface QualityMetrics {
  overallScore: number;
  readabilityScore: number;
  semanticRichness: number;
  eeatScore: number;
  fluffPercentage: number;
  keywordDensity: number;
  avgSentenceLength: number;
  avgParagraphLength: number;
  powerWordCount: number;
  passiveVoicePercentage: number;
  uniqueWordRatio: number;
  entityCount: number;
  citationCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  listCount: number;
  headingDistribution: Record<string, number>;
}

export interface QualityIssue {
  type: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  location?: string;
  autoFixable: boolean;
  fix?: string;
}

export interface EnhancementResult {
  enhancedContent: string;
  metrics: QualityMetrics;
  issues: QualityIssue[];
  appliedFixes: string[];
  processingTimeMs: number;
}

export interface CompetitorInsight {
  rank: number;
  title: string;
  keyAngle: string;
  uniqueValue: string;
}

export interface SerpIntelligence {
  competitorInsights: CompetitorInsight[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  contentGaps: string[];
  differentiationOpportunities: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLUFF PATTERNS - COMPREHENSIVE LIST
// ═══════════════════════════════════════════════════════════════════════════════

const FLUFF_PATTERNS: Array<{ pattern: RegExp; replacement: string; severity: 'high' | 'medium' | 'low' }> = [
  // High severity - completely meaningless
  { pattern: /In today's (?:world|digital age|fast-paced environment|modern era)[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /It's (?:important|crucial|essential|vital|critical) to (?:note|understand|remember|recognize|realize) that\s*/gi, replacement: '', severity: 'high' },
  { pattern: /When it comes to\s*/gi, replacement: 'For ', severity: 'high' },
  { pattern: /At the end of the day[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /In order to\s*/gi, replacement: 'To ', severity: 'high' },
  { pattern: /The fact (?:of the matter |)is\s*/gi, replacement: '', severity: 'high' },
  { pattern: /Needless to say[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /As you (?:may|might|probably) (?:know|be aware)[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /It goes without saying\s*/gi, replacement: '', severity: 'high' },
  { pattern: /For all intents and purposes[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /In the (?:grand |)scheme of things[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /All things considered[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /As a matter of fact[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /First and foremost[,.]?\s*/gi, replacement: '', severity: 'high' },
  { pattern: /Last but not least[,.]?\s*/gi, replacement: '', severity: 'high' },
  
  // Medium severity - can be trimmed
  { pattern: /(?:Basically|Essentially|Fundamentally)[,.]?\s*/gi, replacement: '', severity: 'medium' },
  { pattern: /(?:Obviously|Clearly|Evidently)[,.]?\s*/gi, replacement: '', severity: 'medium' },
  { pattern: /It should be noted that\s*/gi, replacement: '', severity: 'medium' },
  { pattern: /As previously mentioned[,.]?\s*/gi, replacement: '', severity: 'medium' },
  { pattern: /In this day and age[,.]?\s*/gi, replacement: 'Today, ', severity: 'medium' },
  { pattern: /Due to the fact that\s*/gi, replacement: 'Because ', severity: 'medium' },
  { pattern: /In spite of the fact that\s*/gi, replacement: 'Although ', severity: 'medium' },
  { pattern: /In light of the fact that\s*/gi, replacement: 'Since ', severity: 'medium' },
  { pattern: /With regards to\s*/gi, replacement: 'About ', severity: 'medium' },
  { pattern: /In terms of\s*/gi, replacement: 'For ', severity: 'medium' },
  { pattern: /On a daily basis\s*/gi, replacement: 'daily', severity: 'medium' },
  { pattern: /At this point in time\s*/gi, replacement: 'Now, ', severity: 'medium' },
  { pattern: /Each and every\s*/gi, replacement: 'Every ', severity: 'medium' },
  { pattern: /One of the most\s*/gi, replacement: 'A highly ', severity: 'medium' },
  
  // Low severity - style improvements
  { pattern: /(?:Very|Really|Extremely|Incredibly|Absolutely) (\w+)/gi, replacement: '$1', severity: 'low' },
  { pattern: /In conclusion[,.]?\s*/gi, replacement: '', severity: 'low' },
  { pattern: /To summarize[,.]?\s*/gi, replacement: '', severity: 'low' },
  { pattern: /In summary[,.]?\s*/gi, replacement: '', severity: 'low' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PASSIVE VOICE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const PASSIVE_VOICE_PATTERNS = [
  /\b(?:is|are|was|were|been|being)\s+(?:\w+ed|\w+en)\b/gi,
  /\b(?:has|have|had)\s+been\s+(?:\w+ed|\w+en)\b/gi,
  /\b(?:will|shall|may|might|must|should|could|would)\s+be\s+(?:\w+ed|\w+en)\b/gi,
];

// ═══════════════════════════════════════════════════════════════════════════════
// POWER WORDS FOR SEO
// ═══════════════════════════════════════════════════════════════════════════════

const POWER_WORDS = [
  // Urgency
  'now', 'today', 'immediately', 'instant', 'fast', 'quick', 'hurry', 'limited',
  // Exclusivity
  'exclusive', 'secret', 'insider', 'members-only', 'private', 'hidden',
  // Trust
  'proven', 'guaranteed', 'certified', 'official', 'authentic', 'verified', 'trusted',
  // Value
  'free', 'bonus', 'save', 'discount', 'deal', 'bargain', 'value', 'affordable',
  // Results
  'results', 'success', 'effective', 'powerful', 'ultimate', 'best', 'top',
  // Emotion
  'amazing', 'incredible', 'remarkable', 'extraordinary', 'stunning', 'brilliant',
  // Action
  'discover', 'unlock', 'master', 'transform', 'boost', 'skyrocket', 'dominate',
  // Specificity
  'step-by-step', 'complete', 'comprehensive', 'definitive', 'essential', 'critical',
];

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export const ENTERPRISE_SYSTEM_PROMPT = `You are an ELITE SEO content strategist and writer operating at the highest professional level.

## CORE EXPERTISE
- Google's E-E-A-T guidelines (Experience, Expertise, Authoritativeness, Trust)
- NLP and semantic search optimization for modern search algorithms
- AI Overview / SGE optimization for Google's AI-powered search
- Conversion-focused copywriting that drives measurable results
- Featured snippet and Position Zero optimization
- Voice search and conversational query optimization

## ABSOLUTE QUALITY REQUIREMENTS

### 1. UNIQUE INSIGHTS MANDATE
Every paragraph MUST contain at least ONE of:
- Specific data points with sources (e.g., "According to [Source], 67% of...")
- Unique perspectives not found in top 10 SERP results
- Expert-level depth demonstrating first-hand experience
- Actionable advice with measurable outcomes
- Counter-intuitive insights that challenge assumptions

### 2. ENTITY OPTIMIZATION PROTOCOL
- Identify ALL relevant entities (people, organizations, concepts, products)
- Use entity variations and synonyms naturally throughout
- Create semantic clusters around primary and secondary keywords
- Include co-occurring entities that search engines expect
- Link entities to authoritative sources when possible

### 3. AI VISIBILITY STRUCTURE
- Lead with a direct answer in the first 50 words (featured snippet bait)
- Include a TL;DR section at the very top
- Use "What is", "How to", "Why" patterns for AI extraction
- Structure paragraphs as: Claim → Evidence → Insight
- Create clear, extractable definitions for key terms
- Use comparison tables for multi-option content

### 4. READABILITY EXCELLENCE
- Target Flesch-Kincaid Grade Level: 8-10 (accessible but authoritative)
- Sentence variation: Mix short (8-12 words) and medium (15-20 words)
- Maximum paragraph length: 4 sentences
- NO fluff phrases (see banned list below)
- Active voice: 85%+ of sentences
- One idea per paragraph

### 5. SEMANTIC RICHNESS REQUIREMENTS
- Include minimum 15 LSI keywords naturally
- Answer ALL "People Also Ask" questions from SERP data
- Create clear topic hierarchies with proper heading structure
- Use synonyms and related terms throughout (avoid keyword stuffing)
- Include question-based subheadings for voice search

### 6. E-E-A-T TRUST SIGNALS
- Reference authoritative sources (studies, experts, official documentation)
- Include specific numbers, dates, and verifiable facts
- Add expert quotes or cite industry authorities
- Demonstrate first-hand experience where applicable
- Include methodology and data sources for any claims
- Use precise language, avoid hedging ("might", "perhaps", "possibly")

## BANNED PHRASES (NEVER USE)
- "In today's world/digital age/fast-paced environment"
- "It's important/crucial/essential to note/understand/remember"
- "When it comes to"
- "At the end of the day"
- "In order to" (use "To")
- "The fact of the matter is"
- "Needless to say"
- "As you may/might know"
- "Basically/Essentially/Fundamentally"
- "Obviously/Clearly/Evidently"
- "In conclusion/To summarize/In summary"
- "First and foremost"
- "Last but not least"

## OUTPUT QUALITY CHECKS
Before returning content, verify:
☐ Primary keyword appears in first sentence
☐ Every paragraph provides unique value
☐ All statistics have sources cited
☐ No banned phrases present
☐ Active voice dominates (85%+)
☐ TL;DR section is present and compelling
☐ All PAA questions are answered
☐ Internal links use descriptive anchor text
☐ Content structure enables AI extraction`;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPETITIVE INTELLIGENCE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

export function buildCompetitorIntelligence(serpData: any): SerpIntelligence {
  const result: SerpIntelligence = {
    competitorInsights: [],
    peopleAlsoAsk: [],
    relatedSearches: [],
    contentGaps: [],
    differentiationOpportunities: [],
  };

  if (!serpData) return result;

  // Extract competitor insights
  if (serpData.organic?.length) {
    result.competitorInsights = serpData.organic.slice(0, 5).map((item: any, index: number) => ({
      rank: index + 1,
      title: item.title || '',
      keyAngle: extractKeyAngle(item.snippet || ''),
      uniqueValue: item.snippet?.substring(0, 150) || '',
    }));
  }

  // Extract PAA questions
  if (serpData.peopleAlsoAsk?.length) {
    result.peopleAlsoAsk = serpData.peopleAlsoAsk.map((paa: any) => paa.question || paa);
  }

  // Extract related searches
  if (serpData.relatedSearches?.length) {
    result.relatedSearches = serpData.relatedSearches.map((rs: any) => 
      typeof rs === 'string' ? rs : rs.query || ''
    );
  }

  // Identify content gaps
  result.contentGaps = identifyContentGaps(result.competitorInsights, result.peopleAlsoAsk);

  // Identify differentiation opportunities
  result.differentiationOpportunities = identifyDifferentiationOpportunities(result.competitorInsights);

  return result;
}

function extractKeyAngle(snippet: string): string {
  // Extract the main angle/approach from the snippet
  const firstSentence = snippet.split(/[.!?]/)[0];
  return firstSentence?.trim() || snippet.substring(0, 100);
}

function identifyContentGaps(competitors: CompetitorInsight[], paaQuestions: string[]): string[] {
  const gaps: string[] = [];
  
  // Check for missing question types
  const hasHowTo = competitors.some(c => c.title.toLowerCase().includes('how to'));
  const hasWhat = competitors.some(c => c.title.toLowerCase().includes('what is'));
  const hasWhy = competitors.some(c => c.title.toLowerCase().includes('why'));
  const hasBest = competitors.some(c => c.title.toLowerCase().includes('best'));
  const hasVs = competitors.some(c => c.title.toLowerCase().includes(' vs '));

  if (!hasHowTo) gaps.push('Step-by-step tutorial content');
  if (!hasWhat) gaps.push('Definitional/explanatory content');
  if (!hasWhy) gaps.push('Reason-based content (why something matters)');
  if (!hasBest) gaps.push('Comparison/recommendation content');
  if (!hasVs) gaps.push('Head-to-head comparison content');

  // Add unanswered PAA questions as gaps
  paaQuestions.slice(0, 3).forEach(q => {
    gaps.push(`Answer: "${q}"`);
  });

  return gaps;
}

function identifyDifferentiationOpportunities(competitors: CompetitorInsight[]): string[] {
  const opportunities: string[] = [];
  
  // Generic opportunities based on common weaknesses
  opportunities.push('Add original research/data not found in top results');
  opportunities.push('Include expert quotes or interviews');
  opportunities.push('Provide interactive tools or calculators');
  opportunities.push('Add video content or visual explanations');
  opportunities.push('Include case studies with specific metrics');
  opportunities.push('Offer downloadable resources (checklists, templates)');

  return opportunities;
}

export function formatCompetitorIntelligencePrompt(serpIntel: SerpIntelligence): string {
  if (!serpIntel.competitorInsights.length) return '';

  let prompt = `
═══════════════════════════════════════════════════════════════════════════════
🎯 COMPETITIVE INTELLIGENCE (CRITICAL - ADDRESS ALL)
═══════════════════════════════════════════════════════════════════════════════

📊 TOP 5 RANKING PAGES (Analyze and BEAT these):
`;

  serpIntel.competitorInsights.forEach(comp => {
    prompt += `
[Rank #${comp.rank}] "${comp.title}"
   Key angle: ${comp.keyAngle}
   Your task: Provide MORE depth, better examples, unique data`;
  });

  if (serpIntel.peopleAlsoAsk.length) {
    prompt += `

❓ PEOPLE ALSO ASK (Answer ALL in content with dedicated sections):
`;
    serpIntel.peopleAlsoAsk.forEach((q, i) => {
      prompt += `${i + 1}. ${q}\n`;
    });
  }

  if (serpIntel.relatedSearches.length) {
    prompt += `

🔗 RELATED SEARCHES (Incorporate these terms naturally):
${serpIntel.relatedSearches.join(', ')}
`;
  }

  if (serpIntel.contentGaps.length) {
    prompt += `

🎯 CONTENT GAPS TO FILL (Differentiation opportunities):
`;
    serpIntel.contentGaps.forEach((gap, i) => {
      prompt += `${i + 1}. ${gap}\n`;
    });
  }

  prompt += `

⚠️ DIFFERENTIATION MANDATE:
Your content MUST provide value BEYOND what these top results offer.
Include unique data, case studies, or expert insights they lack.
DO NOT simply rewrite competitor content - ADD NEW VALUE.
═══════════════════════════════════════════════════════════════════════════════`;

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT QUALITY ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

export function analyzeContentQuality(content: string, keyword: string): QualityMetrics {
  const textContent = stripHtml(content);
  const words = textContent.split(/\s+/).filter(w => w.length > 0);
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = content.split(/<\/p>|\n\n/).filter(p => p.trim().length > 0);
  
  // Word analysis
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const keywordLower = keyword.toLowerCase();
  const keywordCount = words.filter(w => w.toLowerCase().includes(keywordLower)).length;
  
  // Power word count
  const powerWordCount = POWER_WORDS.filter(pw => 
    textContent.toLowerCase().includes(pw.toLowerCase())
  ).length;

  // Passive voice detection
  let passiveCount = 0;
  PASSIVE_VOICE_PATTERNS.forEach(pattern => {
    const matches = textContent.match(pattern);
    if (matches) passiveCount += matches.length;
  });

  // Fluff detection
  let fluffCount = 0;
  FLUFF_PATTERNS.forEach(fp => {
    const matches = textContent.match(fp.pattern);
    if (matches) fluffCount += matches.length;
  });

  // Link counting
  const internalLinks = (content.match(/class=["']wp-opt-internal["']/gi) || []).length;
  const externalLinks = (content.match(/target=["']_blank["']/gi) || []).length;
  const citations = (content.match(/\[\d+\]|<cite>|<sup>/gi) || []).length;

  // Heading distribution
  const headingDistribution: Record<string, number> = {
    h1: (content.match(/<h1/gi) || []).length,
    h2: (content.match(/<h2/gi) || []).length,
    h3: (content.match(/<h3/gi) || []).length,
    h4: (content.match(/<h4/gi) || []).length,
  };

  // List counting
  const listCount = (content.match(/<ul|<ol/gi) || []).length;

  // Entity detection (simplified - looks for capitalized proper nouns)
  const entityPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const entities = textContent.match(entityPattern) || [];
  const uniqueEntities = new Set(entities);

  // Calculate scores
  const avgSentenceLength = words.length / Math.max(sentences.length, 1);
  const avgParagraphLength = sentences.length / Math.max(paragraphs.length, 1);
  const keywordDensity = (keywordCount / Math.max(words.length, 1)) * 100;
  const passiveVoicePercentage = (passiveCount / Math.max(sentences.length, 1)) * 100;
  const fluffPercentage = (fluffCount / Math.max(sentences.length, 1)) * 100;
  const uniqueWordRatio = uniqueWords.size / Math.max(words.length, 1);

  // Readability score (simplified Flesch-Kincaid approximation)
  const syllablesPerWord = 1.5; // Approximation
  const readabilityScore = Math.max(0, Math.min(100, 
    206.835 - (1.015 * avgSentenceLength) - (84.6 * syllablesPerWord)
  ));

  // Semantic richness (based on unique words, entities, and structure)
  const semanticRichness = Math.min(100, 
    (uniqueWordRatio * 30) + 
    (uniqueEntities.size * 2) + 
    (headingDistribution.h2 * 5) + 
    (headingDistribution.h3 * 3) +
    (listCount * 5) +
    (powerWordCount * 2)
  );

  // E-E-A-T score (based on citations, external links, entities)
  const eeatScore = Math.min(100,
    (citations * 10) +
    (externalLinks * 5) +
    (uniqueEntities.size * 3) +
    (internalLinks * 2) +
    (100 - fluffPercentage)
  );

  // Overall score
  const overallScore = Math.round(
    (readabilityScore * 0.2) +
    (semanticRichness * 0.25) +
    (eeatScore * 0.25) +
    ((100 - fluffPercentage) * 0.15) +
    ((100 - passiveVoicePercentage) * 0.15)
  );

  return {
    overallScore,
    readabilityScore: Math.round(readabilityScore),
    semanticRichness: Math.round(semanticRichness),
    eeatScore: Math.round(eeatScore),
    fluffPercentage: Math.round(fluffPercentage * 10) / 10,
    keywordDensity: Math.round(keywordDensity * 100) / 100,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    avgParagraphLength: Math.round(avgParagraphLength * 10) / 10,
    powerWordCount,
    passiveVoicePercentage: Math.round(passiveVoicePercentage * 10) / 10,
    uniqueWordRatio: Math.round(uniqueWordRatio * 100) / 100,
    entityCount: uniqueEntities.size,
    citationCount: citations,
    internalLinkCount: internalLinks,
    externalLinkCount: externalLinks,
    listCount,
    headingDistribution,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT ENHANCER
// ═══════════════════════════════════════════════════════════════════════════════

export function enhanceContentQuality(
  content: string,
  keyword: string,
  logger?: Logger
): EnhancementResult {
  const startTime = Date.now();
  let enhanced = content;
  const appliedFixes: string[] = [];
  const issues: QualityIssue[] = [];

  // 1. Remove fluff phrases
  FLUFF_PATTERNS.forEach(fp => {
    const matches = enhanced.match(fp.pattern);
    if (matches && matches.length > 0) {
      enhanced = enhanced.replace(fp.pattern, fp.replacement);
      appliedFixes.push(`Removed ${matches.length} instance(s) of fluff pattern`);
      issues.push({
        type: fp.severity === 'high' ? 'critical' : 'warning',
        category: 'Fluff',
        message: `Removed fluff phrase(s): ${matches.slice(0, 2).join(', ')}${matches.length > 2 ? '...' : ''}`,
        autoFixable: true,
      });
    }
  });

  // 2. Ensure keyword in first 100 characters
  const first100 = stripHtml(enhanced.substring(0, 500)).substring(0, 100).toLowerCase();
  if (!first100.includes(keyword.toLowerCase())) {
    issues.push({
      type: 'warning',
      category: 'Keyword Placement',
      message: `Primary keyword "${keyword}" not found in first 100 characters`,
      autoFixable: false,
    });
  }

  // 3. Check for TL;DR
  const hasTldr = enhanced.toLowerCase().includes('tl;dr') || 
                  enhanced.toLowerCase().includes('tldr') ||
                  enhanced.includes('wp-opt-tldr');
  if (!hasTldr) {
    // Add TL;DR section
    const tldrSection = `<div class="wp-opt-tldr">\n<strong>⚡ TL;DR</strong>\n<p>This comprehensive guide covers everything you need to know about ${keyword}, including expert strategies, proven techniques, and actionable insights.</p>\n</div>\n\n`;
    
    // Insert after first paragraph or at start
    const firstPEnd = enhanced.indexOf('</p>');
    if (firstPEnd > 0 && firstPEnd < 500) {
      enhanced = enhanced.substring(0, firstPEnd + 4) + '\n\n' + tldrSection + enhanced.substring(firstPEnd + 4);
    } else {
      enhanced = tldrSection + enhanced;
    }
    appliedFixes.push('Added TL;DR section');
  }

  // 4. Check for Key Takeaways
  const hasTakeaways = enhanced.includes('wp-opt-takeaways') || 
                       enhanced.toLowerCase().includes('key takeaway');
  if (!hasTakeaways) {
    issues.push({
      type: 'suggestion',
      category: 'Content Structure',
      message: 'Consider adding a Key Takeaways section for better scannability',
      autoFixable: false,
    });
  }

  // 5. Clean up multiple spaces and newlines
  enhanced = enhanced.replace(/\s{3,}/g, '  ');
  enhanced = enhanced.replace(/\n{4,}/g, '\n\n\n');

  // 6. Ensure proper spacing after punctuation
  enhanced = enhanced.replace(/([.!?])([A-Z])/g, '$1 $2');

  // 7. Fix common HTML issues
  enhanced = enhanced.replace(/<p>\s*<\/p>/g, ''); // Remove empty paragraphs
  enhanced = enhanced.replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>'); // Reduce excessive line breaks

  // Analyze final quality
  const metrics = analyzeContentQuality(enhanced, keyword);

  // Add issues based on metrics
  if (metrics.fluffPercentage > 5) {
    issues.push({
      type: 'warning',
      category: 'Content Quality',
      message: `Fluff percentage (${metrics.fluffPercentage}%) is above threshold (5%)`,
      autoFixable: false,
    });
  }

  if (metrics.passiveVoicePercentage > 15) {
    issues.push({
      type: 'suggestion',
      category: 'Writing Style',
      message: `Passive voice (${metrics.passiveVoicePercentage}%) exceeds recommended (15%)`,
      autoFixable: false,
    });
  }

  if (metrics.keywordDensity < 0.5) {
    issues.push({
      type: 'warning',
      category: 'SEO',
      message: `Keyword density (${metrics.keywordDensity}%) is below recommended (0.5-2%)`,
      autoFixable: false,
    });
  } else if (metrics.keywordDensity > 3) {
    issues.push({
      type: 'critical',
      category: 'SEO',
      message: `Keyword density (${metrics.keywordDensity}%) is too high - risk of keyword stuffing`,
      autoFixable: false,
    });
  }

  if (metrics.internalLinkCount < 3) {
    issues.push({
      type: 'suggestion',
      category: 'Internal Linking',
      message: `Only ${metrics.internalLinkCount} internal links found - recommend 5-10 for comprehensive content`,
      autoFixable: false,
    });
  }

  const processingTimeMs = Date.now() - startTime;

  if (logger) {
    logger.info('Content quality enhancement complete', {
      originalLength: content.length,
      enhancedLength: enhanced.length,
      fixesApplied: appliedFixes.length,
      issuesFound: issues.length,
      overallScore: metrics.overallScore,
      processingTimeMs,
    });
  }

  return {
    enhancedContent: enhanced,
    metrics,
    issues,
    appliedFixes,
    processingTimeMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface AIModelConfig {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
}

export const QUALITY_OPTIMIZED_AI_CONFIG: AIModelConfig = {
  temperature: 0.3,        // Lower = more focused, factual output
  topP: 0.9,               // Nucleus sampling for coherence
  frequencyPenalty: 0.5,   // Reduce repetition significantly
  presencePenalty: 0.3,    // Encourage topic diversity
  maxTokens: 16000,        // Allow comprehensive responses
};

export const CREATIVE_AI_CONFIG: AIModelConfig = {
  temperature: 0.7,
  topP: 0.95,
  frequencyPenalty: 0.3,
  presencePenalty: 0.2,
  maxTokens: 16000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateWordCount(content: string): number {
  const text = stripHtml(content);
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

export function estimateReadingTime(wordCount: number): number {
  const wordsPerMinute = 200;
  return Math.ceil(wordCount / wordsPerMinute);
}