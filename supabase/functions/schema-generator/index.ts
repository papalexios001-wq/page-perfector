import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Logger, corsHeaders, createErrorResponse, validateRequired } from "../_shared/utils.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOTA ENTERPRISE-GRADE COMPREHENSIVE SCHEMA GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates complete, SEO-optimized structured data markup for maximum
 * AI visibility and rich search results.
 * 
 * Supported Schema Types:
 * - Article (NewsArticle, BlogPosting, TechArticle)
 * - FAQPage
 * - HowTo
 * - VideoObject
 * - BreadcrumbList
 * - WebPage
 * - Organization
 * - Author/Person
 * - SpeakableSpecification (for voice search)
 * - ClaimReview (for fact-based content) [NEW - AI Optimized]
 * - ItemList (for listicle content) [NEW - AI Optimized]
 * - DefinedTerm (for glossary/entity content) [NEW - AI Optimized]
 * 
 * Features:
 * - Auto-detects content type
 * - Generates nested, interconnected schemas
 * - Optimized for Google, Bing, and AI search engines
 * - Speakable markup for voice assistants
 * - AI Overview optimization for Google SGE
 */

interface SchemaRequest {
  title: string;
  description: string;
  content: string;
  url: string;
  publishDate?: string;
  modifiedDate?: string;
  author?: {
    name: string;
    url?: string;
    image?: string;
    jobTitle?: string;
    sameAs?: string[];
  };
  organization?: {
    name: string;
    url?: string;
    logo?: string;
    sameAs?: string[];
  };
  faqs?: Array<{ question: string; answer: string }>;
  howToSteps?: Array<{ name: string; text: string; image?: string }>;
  video?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    contentUrl: string;
    embedUrl: string;
    uploadDate: string;
    duration?: string;
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
  featuredImage?: string;
  wordCount?: number;
  keywords?: string[];
  category?: string;
  // New fields for AI optimization
  definedTerms?: Array<{ term: string; definition: string }>;
  claims?: Array<{ claim: string; source: string; rating?: string }>;
  listItems?: Array<{ name: string; description?: string; position?: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE SCHEMA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

function generateWebPageSchema(req: SchemaRequest): object {
  return {
    "@type": "WebPage",
    "@id": `${req.url}#webpage`,
    "url": req.url,
    "name": req.title,
    "description": req.description,
    "isPartOf": req.organization ? {
      "@id": `${req.organization.url || req.url.split('/').slice(0, 3).join('/')}#website`
    } : undefined,
    "datePublished": req.publishDate,
    "dateModified": req.modifiedDate || req.publishDate,
    "inLanguage": "en-US",
    "potentialAction": [
      {
        "@type": "ReadAction",
        "target": [req.url]
      }
    ],
    // AI Optimization: Add about for entity recognition
    "about": req.keywords?.slice(0, 5).map(kw => ({
      "@type": "Thing",
      "name": kw
    }))
  };
}

function generateArticleSchema(req: SchemaRequest): object {
  // Determine article type based on content
  let articleType = "Article";
  const contentLower = req.content.toLowerCase();
  
  if (contentLower.includes('how to') || contentLower.includes('tutorial') || contentLower.includes('guide')) {
    articleType = "TechArticle";
  } else if (contentLower.includes('news') || contentLower.includes('breaking') || contentLower.includes('update')) {
    articleType = "NewsArticle";
  } else {
    articleType = "BlogPosting";
  }
  
  const schema: Record<string, any> = {
    "@type": articleType,
    "@id": `${req.url}#article`,
    "mainEntityOfPage": {
      "@id": `${req.url}#webpage`
    },
    "headline": req.title.substring(0, 110), // Google limit
    "description": req.description,
    "datePublished": req.publishDate || new Date().toISOString(),
    "dateModified": req.modifiedDate || req.publishDate || new Date().toISOString(),
    "wordCount": req.wordCount || estimateWordCount(req.content),
    "articleBody": cleanContentForSchema(req.content).substring(0, 5000),
    "inLanguage": "en-US",
  };
  
  if (req.author) {
    schema.author = {
      "@type": "Person",
      "@id": `${req.url}#author`,
      "name": req.author.name,
      "url": req.author.url,
      "image": req.author.image,
      // AI Optimization: Add job title and sameAs for E-E-A-T
      "jobTitle": req.author.jobTitle,
      "sameAs": req.author.sameAs
    };
  }
  
  if (req.organization) {
    schema.publisher = {
      "@type": "Organization",
      "@id": `${req.organization.url || req.url.split('/').slice(0, 3).join('/')}#organization`,
      "name": req.organization.name,
      "url": req.organization.url,
      "logo": req.organization.logo ? {
        "@type": "ImageObject",
        "url": req.organization.logo
      } : undefined,
      // AI Optimization: Add sameAs for authority signals
      "sameAs": req.organization.sameAs
    };
  }
  
  if (req.featuredImage) {
    schema.image = {
      "@type": "ImageObject",
      "@id": `${req.url}#primaryimage`,
      "url": req.featuredImage,
      "contentUrl": req.featuredImage
    };
    schema.thumbnailUrl = req.featuredImage;
  }
  
  if (req.keywords && req.keywords.length > 0) {
    schema.keywords = req.keywords.join(', ');
  }
  
  if (req.category) {
    schema.articleSection = req.category;
  }
  
  return schema;
}

function generateFAQSchema(faqs: Array<{ question: string; answer: string }>): object {
  if (!faqs || faqs.length === 0) return {};
  
  return {
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
        // AI Optimization: Add dateCreated for freshness signals
        "dateCreated": new Date().toISOString()
      }
    }))
  };
}

function generateHowToSchema(
  title: string, 
  description: string,
  steps: Array<{ name: string; text: string; image?: string }>,
  totalTime?: string
): object {
  if (!steps || steps.length === 0) return {};
  
  return {
    "@type": "HowTo",
    "name": title,
    "description": description,
    "totalTime": totalTime || `PT${steps.length * 5}M`, // Estimate 5 mins per step
    "step": steps.map((step, index) => ({
      "@type": "HowToStep",
      "position": index + 1,
      "name": step.name,
      "text": step.text,
      "image": step.image ? {
        "@type": "ImageObject",
        "url": step.image
      } : undefined
    }))
  };
}

function generateVideoSchema(video: SchemaRequest['video']): object {
  if (!video) return {};
  
  return {
    "@type": "VideoObject",
    "name": video.name,
    "description": video.description,
    "thumbnailUrl": video.thumbnailUrl,
    "contentUrl": video.contentUrl,
    "embedUrl": video.embedUrl,
    "uploadDate": video.uploadDate,
    "duration": video.duration,
    // AI Optimization: Add interactionStatistic placeholder
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": 0
    }
  };
}

function generateBreadcrumbSchema(breadcrumbs: Array<{ name: string; url: string }>): object {
  if (!breadcrumbs || breadcrumbs.length === 0) return {};
  
  return {
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": crumb.url
    }))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA AI-OPTIMIZED SCHEMA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate AI-optimized schemas for better visibility in AI Overviews
 * and enhanced rich results
 */
function generateAIOptimizedSchemas(req: SchemaRequest): object[] {
  const schemas: object[] = [];
  const contentLower = req.content.toLowerCase();
  
  // 1. ClaimReview for fact-based content (improves E-E-A-T)
  if (contentLower.includes('study') || 
      contentLower.includes('research') || 
      contentLower.includes('according to') ||
      contentLower.includes('statistics show') ||
      contentLower.includes('data shows') ||
      req.claims?.length) {
    
    // Extract or use provided claims
    const claims = req.claims || extractClaimsFromContent(req.content);
    
    claims.slice(0, 3).forEach((claim, idx) => {
      schemas.push({
        "@type": "ClaimReview",
        "@id": `${req.url}#claim-${idx + 1}`,
        "url": req.url,
        "claimReviewed": claim.claim,
        "author": req.author ? { 
          "@type": "Person", 
          "name": req.author.name,
          "url": req.author.url
        } : req.organization ? {
          "@type": "Organization",
          "name": req.organization.name
        } : undefined,
        "datePublished": req.publishDate || new Date().toISOString(),
        "itemReviewed": {
          "@type": "Claim",
          "author": {
            "@type": "Organization",
            "name": claim.source || "Research Studies"
          }
        },
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": 5,
          "bestRating": 5,
          "worstRating": 1,
          "alternateName": claim.rating || "Verified"
        }
      });
    });
  }
  
  // 2. ItemList for listicle content (improves featured snippet chances)
  const listItems = req.listItems || extractListItemsFromContent(req.content);
  if (listItems.length >= 3) {
    schemas.push({
      "@type": "ItemList",
      "@id": `${req.url}#itemlist`,
      "name": req.title,
      "description": req.description,
      "numberOfItems": listItems.length,
      "itemListElement": listItems.slice(0, 15).map((item, i) => ({
        "@type": "ListItem",
        "position": item.position || i + 1,
        "name": item.name,
        "description": item.description,
        "url": `${req.url}#item-${i + 1}`
      }))
    });
  }
  
  // 3. DefinedTerm for glossary/definition content (improves AI understanding)
  const definedTerms = req.definedTerms || extractDefinedTermsFromContent(req.content, req.keywords);
  if (definedTerms.length > 0) {
    schemas.push({
      "@type": "DefinedTermSet",
      "@id": `${req.url}#terms`,
      "name": `Key Terms: ${req.title}`,
      "hasDefinedTerm": definedTerms.slice(0, 10).map((term, idx) => ({
        "@type": "DefinedTerm",
        "@id": `${req.url}#term-${idx + 1}`,
        "name": term.term,
        "description": term.definition,
        "inDefinedTermSet": { "@id": `${req.url}#terms` }
      }))
    });
  }
  
  // 4. WebSite with SearchAction for sitelinks searchbox
  if (req.organization?.url) {
    schemas.push({
      "@type": "WebSite",
      "@id": `${req.organization.url}#website`,
      "url": req.organization.url,
      "name": req.organization.name,
      "publisher": { "@id": `${req.organization.url}#organization` },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${req.organization.url}/?s={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      }
    });
  }
  
  return schemas;
}

/**
 * Generate enhanced speakable specification for voice search optimization
 */
function generateSpeakableSchema(url: string, content: string): object {
  // Identify the best sections for voice assistants to read
  const speakableSelectors = [
    ".wp-opt-tldr",           // TL;DR section
    ".wp-opt-takeaways",      // Key takeaways
    "article > h1",           // Main heading
    "article > p:first-of-type", // Opening paragraph
    ".wp-opt-stat",           // Statistics (great for voice)
    ".wp-opt-faq h3",         // FAQ questions
    ".wp-opt-faq p",          // FAQ answers
  ];
  
  // Also add XPath for more specific targeting
  const speakableXPaths = [
    "/html/body//div[contains(@class, 'wp-opt-tldr')]",
    "/html/body//div[contains(@class, 'wp-opt-takeaways')]",
    "/html/body//article//h1",
    "/html/body//article//p[1]"
  ];
  
  return {
    "@type": "SpeakableSpecification",
    "cssSelector": speakableSelectors,
    "xpath": speakableXPaths
  };
}

/**
 * Extract potential claims from content for ClaimReview schema
 */
function extractClaimsFromContent(content: string): Array<{ claim: string; source: string; rating?: string }> {
  const claims: Array<{ claim: string; source: string; rating?: string }> = [];
  
  // Pattern to find statistics and claims
  const patterns = [
    /([\d.]+%?)\s+(?:of\s+)?([^.]+)(?:according to|per|based on)\s+([^.]+)/gi,
    /(?:research|studies|data)\s+(?:shows?|suggests?|indicates?)\s+(?:that\s+)?([^.]+)/gi,
    /(?:according to)\s+([^,]+),\s+([^.]+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && claims.length < 5) {
      const claimText = match[0].substring(0, 200).trim();
      if (claimText.length > 20) {
        claims.push({
          claim: claimText,
          source: "Research Studies",
          rating: "Verified"
        });
      }
    }
  }
  
  return claims;
}

/**
 * Extract list items from content for ItemList schema
 */
function extractListItemsFromContent(content: string): Array<{ name: string; description?: string; position?: number }> {
  const items: Array<{ name: string; description?: string; position?: number }> = [];
  
  // Match various list patterns
  const patterns = [
    // Numbered lists: "1. Item name"
    /<li[^>]*>\s*(?:<strong>)?\s*(\d+)[.):}\s]+([^<]+)(?:<\/strong>)?/gi,
    // H2/H3 with numbers: "## 1. Item"
    /<h[23][^>]*>\s*(?:\d+[.):}\s]+)?([^<]+)<\/h[23]>/gi,
    // Strong items in lists
    /<li[^>]*>\s*<strong>([^<]+)<\/strong>/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && items.length < 20) {
      const name = (match[2] || match[1] || '').replace(/<[^>]*>/g, '').trim();
      if (name.length > 5 && name.length < 200) {
        items.push({
          name: name,
          position: items.length + 1
        });
      }
    }
  }
  
  return items;
}

/**
 * Extract defined terms from content for DefinedTerm schema
 */
function extractDefinedTermsFromContent(
  content: string, 
  keywords?: string[]
): Array<{ term: string; definition: string }> {
  const terms: Array<{ term: string; definition: string }> = [];
  
  // Pattern: "Term is/are defined as..." or "Term: definition"
  const patterns = [
    /(?:<strong>)?([A-Z][a-zA-Z\s]+)(?:<\/strong>)?\s+(?:is|are)\s+(?:defined as|a|an|the)\s+([^.]+\.)/gi,
    /(?:<dt>|<strong>)([^<]+)(?:<\/dt>|<\/strong>)\s*(?:<dd>|:)\s*([^<]+)/gi,
    /\*\*([^*]+)\*\*:\s*([^.]+\.)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && terms.length < 10) {
      const term = match[1].trim();
      const definition = match[2].trim();
      
      if (term.length > 2 && term.length < 50 && definition.length > 20) {
        terms.push({ term, definition });
      }
    }
  }
  
  // Also add keywords as terms if we found definitions
  if (keywords && terms.length < 5) {
    for (const keyword of keywords.slice(0, 3)) {
      // Try to find a definition for this keyword in content
      const keywordPattern = new RegExp(
        `${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*(?:is|are|means|refers to)\\s+([^.]+\\.)`,
        'i'
      );
      const match = content.match(keywordPattern);
      if (match && match[1]) {
        terms.push({
          term: keyword,
          definition: match[1].trim()
        });
      }
    }
  }
  
  return terms;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function estimateWordCount(content: string): number {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').length;
}

function cleanContentForSchema(content: string): string {
  return content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectHowToContent(content: string): Array<{ name: string; text: string }> | null {
  const steps: Array<{ name: string; text: string }> = [];
  
  // Look for numbered steps or "Step X" patterns
  const stepPatterns = [
    /<h[23][^>]*>\s*(?:Step\s*)?(\d+)[.:)]\s*([^<]+)<\/h[23]>/gi,
    /<li[^>]*>\s*(?:Step\s*)?(\d+)[.:)]\s*([^<]+)<\/li>/gi,
    /<strong>\s*(?:Step\s*)?(\d+)[.:)]\s*([^<]+)<\/strong>/gi,
  ];
  
  for (const pattern of stepPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      steps.push({
        name: `Step ${match[1]}`,
        text: match[2].trim()
      });
    }
    if (steps.length >= 3) break;
  }
  
  return steps.length >= 3 ? steps : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function generateComprehensiveSchema(req: SchemaRequest): object {
  const schemas: object[] = [];
  
  // 1. WebPage schema (always)
  schemas.push(generateWebPageSchema(req));
  
  // 2. Article schema (always for blog posts)
  const articleSchema = generateArticleSchema(req);
  schemas.push(articleSchema);
  
  // 3. FAQ schema (if FAQs provided)
  if (req.faqs && req.faqs.length > 0) {
    schemas.push(generateFAQSchema(req.faqs));
  }
  
  // 4. HowTo schema (if steps provided or detected)
  const detectedSteps = detectHowToContent(req.content);
  if (req.howToSteps && req.howToSteps.length > 0) {
    schemas.push(generateHowToSchema(req.title, req.description, req.howToSteps));
  } else if (detectedSteps) {
    schemas.push(generateHowToSchema(req.title, req.description, detectedSteps));
  }
  
  // 5. Video schema (if video provided)
  if (req.video) {
    schemas.push(generateVideoSchema(req.video));
  }
  
  // 6. Breadcrumb schema (if provided)
  if (req.breadcrumbs && req.breadcrumbs.length > 0) {
    schemas.push(generateBreadcrumbSchema(req.breadcrumbs));
  }
  
  // 7. SOTA: Add AI-optimized schemas
  const aiOptimizedSchemas = generateAIOptimizedSchemas(req);
  schemas.push(...aiOptimizedSchemas);
  
  // 8. Add enhanced speakable for voice search optimization
  const articleSchemaObj = schemas.find((s: any) => 
    s['@type'] === 'Article' || s['@type'] === 'BlogPosting' || s['@type'] === 'TechArticle'
  );
  if (articleSchemaObj) {
    (articleSchemaObj as any).speakable = generateSpeakableSchema(req.url, req.content);
  }
  
  // 9. Add mainEntity relationships for better AI understanding
  const faqSchema = schemas.find((s: any) => s['@type'] === 'FAQPage');
  if (faqSchema && articleSchemaObj) {
    (articleSchemaObj as any).mainEntity = { "@id": `${req.url}#faq` };
    (faqSchema as any)['@id'] = `${req.url}#faq`;
  }
  
  // Wrap in @graph for JSON-LD
  return {
    "@context": "https://schema.org",
    "@graph": schemas.filter(s => Object.keys(s).length > 1)
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const logger = new Logger('schema-generator');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body: SchemaRequest = await req.json();
    
    validateRequired(body as unknown as Record<string, unknown>, ['title', 'description', 'content', 'url']);
    
    logger.info('Generating comprehensive SOTA schema', { 
      url: body.url, 
      hasFaqs: !!(body.faqs?.length),
      hasVideo: !!body.video,
      hasBreadcrumbs: !!(body.breadcrumbs?.length),
      hasKeywords: !!(body.keywords?.length),
      aiOptimizationsEnabled: true
    });
    
    const schema = generateComprehensiveSchema(body);
    
    // Generate the script tag ready for insertion
    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
    
    // Extract schema types for reporting
    const schemaTypes = (schema as any)['@graph']?.map((s: any) => s['@type']).filter(Boolean) || [];
    
    logger.info('SOTA Schema generation complete', { 
      graphItems: (schema as any)['@graph']?.length || 0,
      schemaTypes: schemaTypes
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema,
        scriptTag,
        stats: {
          schemaTypes: schemaTypes,
          totalSchemas: schemaTypes.length,
          aiOptimized: true,
          speakableEnabled: true,
          features: {
            claimReview: schemaTypes.includes('ClaimReview'),
            itemList: schemaTypes.includes('ItemList'),
            definedTermSet: schemaTypes.includes('DefinedTermSet'),
            faqPage: schemaTypes.includes('FAQPage'),
            howTo: schemaTypes.includes('HowTo'),
            videoObject: schemaTypes.includes('VideoObject'),
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('Schema generation error', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
