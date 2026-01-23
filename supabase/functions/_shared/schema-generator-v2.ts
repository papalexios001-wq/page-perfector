/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI-OPTIMIZED SCHEMA GENERATOR v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Enterprise-grade structured data generation optimized for:
 * - Google AI Overviews / SGE
 * - Voice Search / Speakable
 * - Rich Results / Featured Snippets
 * - Knowledge Graph integration
 * 
 * Supported Schema Types:
 * - Article (NewsArticle, BlogPosting, TechArticle, HowToArticle)
 * - FAQPage
 * - HowTo
 * - VideoObject
 * - BreadcrumbList
 * - WebPage
 * - Organization
 * - Author/Person
 * - SpeakableSpecification
 * - ClaimReview (NEW - for fact-based content)
 * - ItemList (NEW - for listicles)
 * - Course (NEW - for educational content)
 * - Product (NEW - for reviews)
 * 
 * @version 2.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchemaInput {
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
  howToSteps?: Array<{ name: string; text: string; image?: string; url?: string }>;
  video?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    contentUrl?: string;
    embedUrl: string;
    uploadDate: string;
    duration?: string;
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
  featuredImage?: string;
  wordCount?: number;
  keywords?: string[];
  category?: string;
  claims?: Array<{ claim: string; source: string; rating?: number }>;
  listItems?: Array<{ name: string; description?: string; url?: string; position?: number }>;
  course?: {
    name: string;
    description: string;
    provider: string;
    duration?: string;
  };
  product?: {
    name: string;
    description: string;
    rating?: number;
    reviewCount?: number;
    price?: string;
    currency?: string;
  };
}

export interface SchemaOutput {
  '@context': string;
  '@graph': object[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function generateWebPageSchema(input: SchemaInput): object {
  const baseUrl = input.url.split('/').slice(0, 3).join('/');
  
  return {
    '@type': 'WebPage',
    '@id': `${input.url}#webpage`,
    'url': input.url,
    'name': input.title,
    'description': input.description,
    'isPartOf': {
      '@id': `${baseUrl}#website`
    },
    'primaryImageOfPage': input.featuredImage ? {
      '@id': `${input.url}#primaryimage`
    } : undefined,
    'datePublished': input.publishDate,
    'dateModified': input.modifiedDate || input.publishDate,
    'inLanguage': 'en-US',
    'potentialAction': [
      {
        '@type': 'ReadAction',
        'target': [input.url]
      }
    ]
  };
}

export function generateArticleSchema(input: SchemaInput): object {
  const contentLower = input.content.toLowerCase();
  
  // Intelligent article type detection
  let articleType = 'Article';
  if (contentLower.includes('how to') || contentLower.includes('step') || contentLower.includes('tutorial')) {
    articleType = 'TechArticle';
  } else if (contentLower.includes('news') || contentLower.includes('breaking') || contentLower.includes('update') || contentLower.includes('announced')) {
    articleType = 'NewsArticle';
  } else if (contentLower.includes('review') || contentLower.includes('rating') || contentLower.includes('comparison')) {
    articleType = 'Review';
  } else {
    articleType = 'BlogPosting';
  }
  
  const schema: Record<string, any> = {
    '@type': articleType,
    '@id': `${input.url}#article`,
    'isPartOf': {
      '@id': `${input.url}#webpage`
    },
    'headline': input.title.substring(0, 110),
    'description': input.description,
    'datePublished': input.publishDate || new Date().toISOString(),
    'dateModified': input.modifiedDate || input.publishDate || new Date().toISOString(),
    'mainEntityOfPage': {
      '@id': `${input.url}#webpage`
    },
    'wordCount': input.wordCount || estimateWordCount(input.content),
    'inLanguage': 'en-US',
    'copyrightYear': new Date().getFullYear(),
  };
  
  // Author with enhanced E-E-A-T signals
  if (input.author) {
    schema.author = {
      '@type': 'Person',
      '@id': `${input.url}#author`,
      'name': input.author.name,
      'url': input.author.url,
      'image': input.author.image,
      'jobTitle': input.author.jobTitle,
      'sameAs': input.author.sameAs,
    };
  }
  
  // Publisher/Organization
  if (input.organization) {
    const baseUrl = input.url.split('/').slice(0, 3).join('/');
    schema.publisher = {
      '@type': 'Organization',
      '@id': `${baseUrl}#organization`,
      'name': input.organization.name,
      'url': input.organization.url || baseUrl,
      'logo': input.organization.logo ? {
        '@type': 'ImageObject',
        '@id': `${baseUrl}#logo`,
        'url': input.organization.logo,
        'contentUrl': input.organization.logo,
        'inLanguage': 'en-US',
      } : undefined,
      'sameAs': input.organization.sameAs,
    };
  }
  
  // Featured image with full ImageObject
  if (input.featuredImage) {
    schema.image = {
      '@type': 'ImageObject',
      '@id': `${input.url}#primaryimage`,
      'url': input.featuredImage,
      'contentUrl': input.featuredImage,
      'inLanguage': 'en-US',
    };
    schema.thumbnailUrl = input.featuredImage;
  }
  
  // Keywords
  if (input.keywords && input.keywords.length > 0) {
    schema.keywords = input.keywords.join(', ');
  }
  
  // Category/Section
  if (input.category) {
    schema.articleSection = input.category;
  }
  
  // Speakable for voice search
  schema.speakable = {
    '@type': 'SpeakableSpecification',
    'cssSelector': [
      '.wp-opt-tldr',
      '.wp-opt-takeaways',
      'article h1',
      'article > p:first-of-type',
      '.wp-opt-faq h3',
    ]
  };
  
  return schema;
}

export function generateFAQSchema(faqs: Array<{ question: string; answer: string }>): object | null {
  if (!faqs || faqs.length === 0) return null;
  
  return {
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': cleanTextForSchema(faq.answer)
      }
    }))
  };
}

export function generateHowToSchema(
  title: string,
  description: string,
  steps: Array<{ name: string; text: string; image?: string; url?: string }>,
  totalTime?: string
): object | null {
  if (!steps || steps.length === 0) return null;
  
  return {
    '@type': 'HowTo',
    'name': title,
    'description': description,
    'totalTime': totalTime || `PT${steps.length * 5}M`,
    'step': steps.map((step, index) => ({
      '@type': 'HowToStep',
      'position': index + 1,
      'name': step.name,
      'text': step.text,
      'url': step.url,
      'image': step.image ? {
        '@type': 'ImageObject',
        'url': step.image
      } : undefined
    }))
  };
}

export function generateVideoSchema(video: SchemaInput['video']): object | null {
  if (!video) return null;
  
  return {
    '@type': 'VideoObject',
    'name': video.name,
    'description': video.description,
    'thumbnailUrl': video.thumbnailUrl,
    'contentUrl': video.contentUrl,
    'embedUrl': video.embedUrl,
    'uploadDate': video.uploadDate,
    'duration': video.duration,
    'interactionStatistic': {
      '@type': 'InteractionCounter',
      'interactionType': { '@type': 'WatchAction' },
      'userInteractionCount': 0 // Will be updated by actual data
    }
  };
}

export function generateBreadcrumbSchema(breadcrumbs: Array<{ name: string; url: string }>): object | null {
  if (!breadcrumbs || breadcrumbs.length === 0) return null;
  
  return {
    '@type': 'BreadcrumbList',
    'itemListElement': breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': crumb.name,
      'item': crumb.url
    }))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: AI-OPTIMIZED SCHEMA TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ClaimReview schema for fact-checked content
 * Helps with Google's fact-check rich results
 */
export function generateClaimReviewSchema(
  claims: Array<{ claim: string; source: string; rating?: number }>,
  author: SchemaInput['author'],
  url: string
): object[] {
  if (!claims || claims.length === 0) return [];
  
  return claims.map((claim, index) => ({
    '@type': 'ClaimReview',
    '@id': `${url}#claim-${index + 1}`,
    'url': url,
    'claimReviewed': claim.claim,
    'itemReviewed': {
      '@type': 'Claim',
      'author': {
        '@type': 'Organization',
        'name': claim.source
      }
    },
    'author': author ? {
      '@type': 'Person',
      'name': author.name,
      'url': author.url
    } : undefined,
    'reviewRating': {
      '@type': 'Rating',
      'ratingValue': claim.rating || 4,
      'bestRating': 5,
      'worstRating': 1,
      'alternateName': getRatingLabel(claim.rating || 4)
    }
  }));
}

/**
 * ItemList schema for listicle content
 * Helps with AI extraction and featured snippets
 */
export function generateItemListSchema(
  items: Array<{ name: string; description?: string; url?: string; position?: number }>,
  listName: string,
  url: string
): object | null {
  if (!items || items.length < 3) return null;
  
  return {
    '@type': 'ItemList',
    '@id': `${url}#itemlist`,
    'name': listName,
    'numberOfItems': items.length,
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': item.position || index + 1,
      'name': item.name,
      'description': item.description,
      'url': item.url || `${url}#item-${index + 1}`
    }))
  };
}

/**
 * Course schema for educational content
 */
export function generateCourseSchema(course: SchemaInput['course'], url: string): object | null {
  if (!course) return null;
  
  return {
    '@type': 'Course',
    '@id': `${url}#course`,
    'name': course.name,
    'description': course.description,
    'provider': {
      '@type': 'Organization',
      'name': course.provider
    },
    'timeRequired': course.duration,
    'educationalLevel': 'Beginner to Advanced',
    'teaches': course.description,
  };
}

/**
 * Product/Review schema for product-related content
 */
export function generateProductReviewSchema(product: SchemaInput['product'], url: string): object | null {
  if (!product) return null;
  
  const schema: Record<string, any> = {
    '@type': 'Product',
    '@id': `${url}#product`,
    'name': product.name,
    'description': product.description,
  };
  
  if (product.rating && product.reviewCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': product.rating,
      'bestRating': 5,
      'worstRating': 1,
      'reviewCount': product.reviewCount
    };
  }
  
  if (product.price && product.currency) {
    schema.offers = {
      '@type': 'Offer',
      'price': product.price,
      'priceCurrency': product.currency,
      'availability': 'https://schema.org/InStock'
    };
  }
  
  return schema;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-detect HowTo steps from content
 */
export function detectHowToContent(content: string): Array<{ name: string; text: string }> | null {
  const steps: Array<{ name: string; text: string }> = [];
  
  const patterns = [
    // Match "Step X: Title" followed by description
    /<h[23][^>]*>\s*(?:Step\s*)?(\d+)[.:)]\s*([^<]+)<\/h[23]>\s*<p>([^<]+)<\/p>/gi,
    // Match numbered list items
    /<li[^>]*>\s*<strong>([^<]+)<\/strong>\s*[-–:]?\s*([^<]+)<\/li>/gi,
    // Match bold numbered steps
    /<p[^>]*>\s*<strong>\s*(?:Step\s*)?(\d+)[.:)]\s*([^<]+)<\/strong>\s*[-–:]?\s*([^<]+)<\/p>/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[2] && match[2].trim()) {
        steps.push({
          name: match[2].trim(),
          text: (match[3] || match[2]).trim()
        });
      }
    }
    if (steps.length >= 3) break;
  }
  
  return steps.length >= 3 ? steps.slice(0, 10) : null;
}

/**
 * Auto-detect FAQ content
 */
export function detectFAQContent(content: string): Array<{ question: string; answer: string }> | null {
  const faqs: Array<{ question: string; answer: string }> = [];
  
  // Match question-answer patterns
  const patterns = [
    // Match H3 questions followed by paragraphs
    /<h3[^>]*>([^<]*\?)<\/h3>\s*<p>([^<]+)<\/p>/gi,
    // Match wp-opt-faq boxes
    /<div[^>]*class="[^"]*wp-opt-faq[^"]*"[^>]*>\s*<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>/gi,
    // Match strong questions
    /<p[^>]*>\s*<strong>([^<]*\?)<\/strong>\s*<\/p>\s*<p>([^<]+)<\/p>/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[2]) {
        faqs.push({
          question: cleanTextForSchema(match[1]),
          answer: cleanTextForSchema(match[2])
        });
      }
    }
  }
  
  return faqs.length >= 2 ? faqs.slice(0, 10) : null;
}

/**
 * Auto-detect list items for ItemList schema
 */
export function detectListItems(content: string): Array<{ name: string; description?: string }> | null {
  const items: Array<{ name: string; description?: string }> = [];
  
  // Match H2/H3 followed by paragraphs (common listicle pattern)
  const pattern = /<h[23][^>]*>\s*(\d+[.)]?\s*)?([^<]+)<\/h[23]>\s*<p>([^<]+)<\/p>/gi;
  
  let match;
  while ((match = pattern.exec(content)) !== null) {
    if (match[2] && match[3]) {
      items.push({
        name: cleanTextForSchema(match[2]),
        description: cleanTextForSchema(match[3]).substring(0, 200)
      });
    }
  }
  
  return items.length >= 5 ? items : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export function generateComprehensiveSchema(input: SchemaInput): SchemaOutput {
  const schemas: object[] = [];
  
  // 1. WebPage schema (always)
  schemas.push(generateWebPageSchema(input));
  
  // 2. Article schema (always for content)
  schemas.push(generateArticleSchema(input));
  
  // 3. FAQ schema (provided or auto-detected)
  const faqs = input.faqs || detectFAQContent(input.content);
  if (faqs && faqs.length > 0) {
    const faqSchema = generateFAQSchema(faqs);
    if (faqSchema) schemas.push(faqSchema);
  }
  
  // 4. HowTo schema (provided or auto-detected)
  const steps = input.howToSteps || detectHowToContent(input.content);
  if (steps && steps.length > 0) {
    const howToSchema = generateHowToSchema(input.title, input.description, steps);
    if (howToSchema) schemas.push(howToSchema);
  }
  
  // 5. Video schema
  if (input.video) {
    const videoSchema = generateVideoSchema(input.video);
    if (videoSchema) schemas.push(videoSchema);
  }
  
  // 6. Breadcrumb schema
  if (input.breadcrumbs && input.breadcrumbs.length > 0) {
    const breadcrumbSchema = generateBreadcrumbSchema(input.breadcrumbs);
    if (breadcrumbSchema) schemas.push(breadcrumbSchema);
  }
  
  // 7. ClaimReview schema (for fact-based content)
  if (input.claims && input.claims.length > 0) {
    const claimSchemas = generateClaimReviewSchema(input.claims, input.author, input.url);
    schemas.push(...claimSchemas);
  } else {
    // Auto-detect claims from content
    const autoClaims = detectClaimsInContent(input.content);
    if (autoClaims.length > 0) {
      const claimSchemas = generateClaimReviewSchema(autoClaims, input.author, input.url);
      schemas.push(...claimSchemas);
    }
  }
  
  // 8. ItemList schema (for listicles)
  const listItems = input.listItems || detectListItems(input.content);
  if (listItems && listItems.length >= 5) {
    const itemListSchema = generateItemListSchema(listItems, input.title, input.url);
    if (itemListSchema) schemas.push(itemListSchema);
  }
  
  // 9. Course schema (for educational content)
  if (input.course) {
    const courseSchema = generateCourseSchema(input.course, input.url);
    if (courseSchema) schemas.push(courseSchema);
  }
  
  // 10. Product schema (for review content)
  if (input.product) {
    const productSchema = generateProductReviewSchema(input.product, input.url);
    if (productSchema) schemas.push(productSchema);
  }
  
  return {
    '@context': 'https://schema.org',
    '@graph': schemas.filter(s => s && Object.keys(s).length > 1)
  };
}

/**
 * Generate ready-to-use script tag
 */
export function generateSchemaScriptTag(input: SchemaInput): string {
  const schema = generateComprehensiveSchema(input);
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function estimateWordCount(content: string): number {
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').filter(w => w.length > 0).length;
}

function cleanTextForSchema(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '\'')
    .trim();
}

function getRatingLabel(rating: number): string {
  if (rating >= 4.5) return 'True';
  if (rating >= 3.5) return 'Mostly True';
  if (rating >= 2.5) return 'Mixed';
  if (rating >= 1.5) return 'Mostly False';
  return 'False';
}

function detectClaimsInContent(content: string): Array<{ claim: string; source: string; rating: number }> {
  const claims: Array<{ claim: string; source: string; rating: number }> = [];
  
  // Look for patterns like "According to [Source], [claim]"
  const patterns = [
    /According to ([^,]+),\s*([^.]+\.)/gi,
    /([A-Z][^,]+) (?:reports?|found|shows?|reveals?) that ([^.]+\.)/gi,
    /A (?:study|research|report) (?:by|from) ([^,]+) (?:found|shows|indicates) ([^.]+\.)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[2]) {
        claims.push({
          claim: cleanTextForSchema(match[2]),
          source: cleanTextForSchema(match[1]),
          rating: 4 // Default to "Mostly True" for cited claims
        });
      }
    }
    if (claims.length >= 3) break;
  }
  
  return claims.slice(0, 5);
}