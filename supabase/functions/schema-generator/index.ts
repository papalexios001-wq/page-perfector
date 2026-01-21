import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Logger, corsHeaders, createErrorResponse, validateRequired } from "../_shared/utils.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE-GRADE COMPREHENSIVE SCHEMA GENERATOR
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
 * 
 * Features:
 * - Auto-detects content type
 * - Generates nested, interconnected schemas
 * - Optimized for Google, Bing, and AI search engines
 * - Speakable markup for voice assistants
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
  };
  organization?: {
    name: string;
    url?: string;
    logo?: string;
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA GENERATORS
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
    ]
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
      "image": req.author.image
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
      } : undefined
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
        "text": faq.answer
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
    "duration": video.duration
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

function generateSpeakableSchema(url: string, selectors: string[]): object {
  return {
    "@type": "SpeakableSpecification",
    "cssSelector": selectors.length > 0 ? selectors : [
      ".wp-opt-tldr",
      ".wp-opt-takeaways",
      "article > h1",
      "article > p:first-of-type"
    ]
  };
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
  schemas.push(generateArticleSchema(req));
  
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
  
  // 7. Add speakable for voice search optimization
  const articleSchema = schemas.find((s: any) => 
    s['@type'] === 'Article' || s['@type'] === 'BlogPosting' || s['@type'] === 'TechArticle'
  );
  if (articleSchema) {
    (articleSchema as any).speakable = generateSpeakableSchema(req.url, []);
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
    
    logger.info('Generating comprehensive schema', { 
      url: body.url, 
      hasFaqs: !!(body.faqs?.length),
      hasVideo: !!body.video,
      hasBreadcrumbs: !!(body.breadcrumbs?.length)
    });
    
    const schema = generateComprehensiveSchema(body);
    
    // Generate the script tag ready for insertion
    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
    
    logger.info('Schema generation complete', { 
      graphItems: (schema as any)['@graph']?.length || 0 
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema,
        scriptTag,
        stats: {
          schemaTypes: (schema as any)['@graph']?.map((s: any) => s['@type']) || []
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('Schema generation error', { error: error instanceof Error ? error.message : 'Unknown' });
    return createErrorResponse(error as Error, logger.getRequestId());
  }
});
