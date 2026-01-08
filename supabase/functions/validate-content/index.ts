import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  optimization: {
    optimizedTitle: string;
    metaDescription: string;
    h1: string;
    h2s: string[];
    contentStrategy: {
      wordCount: number;
      readabilityScore: number;
      keywordDensity: number;
      lsiKeywords: string[];
    };
    internalLinks: Array<{ anchor: string; target: string; position: number }>;
    qualityScore: number;
  };
  targetKeyword?: string;
  minQualityScore?: number;
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  actual: string | number;
  expected: string;
  severity: 'error' | 'warning' | 'info';
}

interface ValidationResult {
  success: boolean;
  canPublish: boolean;
  overallScore: number;
  checks: ValidationCheck[];
  summary: {
    errors: number;
    warnings: number;
    passed: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      optimization, 
      targetKeyword,
      minQualityScore = 75 
    }: ValidationRequest = await req.json();

    if (!optimization) {
      return new Response(
        JSON.stringify({
          success: false,
          canPublish: false,
          overallScore: 0,
          checks: [],
          summary: { errors: 1, warnings: 0, passed: 0 },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checks: ValidationCheck[] = [];

    // Title validation
    const titleLength = optimization.optimizedTitle?.length || 0;
    checks.push({
      name: 'Title Length',
      passed: titleLength >= 50 && titleLength <= 60,
      actual: titleLength,
      expected: '50-60 characters',
      severity: titleLength < 40 || titleLength > 70 ? 'error' : 'warning',
    });

    // Title contains keyword
    if (targetKeyword) {
      const titleHasKeyword = optimization.optimizedTitle?.toLowerCase().includes(targetKeyword.toLowerCase());
      checks.push({
        name: 'Title Contains Keyword',
        passed: titleHasKeyword,
        actual: titleHasKeyword ? 'Yes' : 'No',
        expected: 'Keyword in title',
        severity: 'warning',
      });
    }

    // Meta description validation
    const metaLength = optimization.metaDescription?.length || 0;
    checks.push({
      name: 'Meta Description Length',
      passed: metaLength >= 150 && metaLength <= 160,
      actual: metaLength,
      expected: '150-160 characters',
      severity: metaLength < 120 || metaLength > 180 ? 'error' : 'warning',
    });

    // H1 presence
    checks.push({
      name: 'H1 Present',
      passed: Boolean(optimization.h1 && optimization.h1.length > 0),
      actual: optimization.h1 ? 'Yes' : 'No',
      expected: 'H1 heading required',
      severity: 'error',
    });

    // H2 count
    const h2Count = optimization.h2s?.length || 0;
    checks.push({
      name: 'H2 Subheadings',
      passed: h2Count >= 3 && h2Count <= 7,
      actual: h2Count,
      expected: '3-7 subheadings',
      severity: h2Count === 0 ? 'error' : 'warning',
    });

    // Word count
    const wordCount = optimization.contentStrategy?.wordCount || 0;
    checks.push({
      name: 'Word Count',
      passed: wordCount >= 1500,
      actual: wordCount,
      expected: '≥1500 words',
      severity: wordCount < 1000 ? 'error' : 'warning',
    });

    // Readability score
    const readability = optimization.contentStrategy?.readabilityScore || 0;
    checks.push({
      name: 'Readability Score',
      passed: readability >= 60,
      actual: readability,
      expected: '≥60 (Flesch-Kincaid)',
      severity: readability < 40 ? 'error' : 'warning',
    });

    // Keyword density
    const density = optimization.contentStrategy?.keywordDensity || 0;
    checks.push({
      name: 'Keyword Density',
      passed: density >= 0.5 && density <= 2.5,
      actual: `${density}%`,
      expected: '0.5-2.5%',
      severity: density > 3 ? 'error' : 'warning',
    });

    // LSI keywords
    const lsiCount = optimization.contentStrategy?.lsiKeywords?.length || 0;
    checks.push({
      name: 'LSI Keywords',
      passed: lsiCount >= 3,
      actual: lsiCount,
      expected: '≥3 LSI keywords',
      severity: 'info',
    });

    // Internal links
    const linkCount = optimization.internalLinks?.length || 0;
    checks.push({
      name: 'Internal Links',
      passed: linkCount >= 2,
      actual: linkCount,
      expected: '≥2 internal links',
      severity: 'warning',
    });

    // Quality score
    const qualityScore = optimization.qualityScore || 0;
    checks.push({
      name: 'Quality Score',
      passed: qualityScore >= minQualityScore,
      actual: qualityScore,
      expected: `≥${minQualityScore}`,
      severity: qualityScore < 50 ? 'error' : qualityScore < minQualityScore ? 'warning' : 'info',
    });

    // Calculate summary
    const errors = checks.filter(c => !c.passed && c.severity === 'error').length;
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning').length;
    const passed = checks.filter(c => c.passed).length;

    // Calculate overall score based on checks
    const maxScore = checks.length * 10;
    let earnedScore = 0;
    for (const check of checks) {
      if (check.passed) {
        earnedScore += 10;
      } else if (check.severity === 'warning') {
        earnedScore += 5;
      }
    }
    const overallScore = Math.round((earnedScore / maxScore) * 100);

    // Can publish if no errors and score meets minimum
    const canPublish = errors === 0 && qualityScore >= minQualityScore;

    const result: ValidationResult = {
      success: true,
      canPublish,
      overallScore,
      checks,
      summary: { errors, warnings, passed },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Validate] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        canPublish: false,
        overallScore: 0,
        checks: [],
        summary: { errors: 1, warnings: 0, passed: 0 },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
