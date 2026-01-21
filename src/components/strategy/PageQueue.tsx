import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  List, Search, Filter, Zap, Eye, Trash2, RotateCcw, FileText, 
  ChevronLeft, ChevronRight, RefreshCw, Loader2, CheckCircle2, 
  XCircle, Upload, Send, AlertTriangle, Info, CheckCheck, ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ScoreIndicator } from '@/components/shared/ScoreIndicator';
import { OptimizationProgress, DEFAULT_STEPS, OptimizationStep } from './OptimizationProgress';
import { ContentPreviewDialog } from './ContentPreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/supabase';
import { useConfigStore } from '@/stores/config-store';
import { useJobProgress } from '@/hooks/useJobProgress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

interface DBPage {
  id: string;
  url: string;
  slug: string;
  title: string;
  word_count: number | null;
  status: string | null;
  score_before: unknown;
  score_after: unknown;
  post_id: number | null;
  post_type: string | null;
  categories: string[] | null;
  tags: string[] | null;
  featured_image: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface OptimizationResult {
  optimizedTitle: string;
  metaDescription: string;
  h1: string;
  h2s: string[];
  optimizedContent?: string;
  contentStrategy: {
    wordCount: number;
    readabilityScore: number;
    keywordDensity: number;
    lsiKeywords: string[];
  };
  internalLinks: Array<{ anchor: string; target: string; position: number }>;
  references?: Array<{ title: string; url: string; snippet?: string }>;
  youtubeVideo?: { title: string; videoId: string; description?: string };
  schema: Record<string, unknown>;
  aiSuggestions: {
    contentGaps: string;
    quickWins: string;
    improvements: string[];
  };
  qualityScore: number;
  estimatedRankPosition: number;
  confidenceLevel: number;
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
  summary: { errors: number; warnings: number; passed: number };
}

interface JobResult {
  page_id: string;
  result: OptimizationResult | null;
}

export interface PageQueueRef {
  refresh: () => Promise<void>;
}

export const PageQueue = forwardRef<PageQueueRef>(function PageQueue(_props, ref) {
  const [pages, setPages] = useState<DBPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Progress bar state - now driven by real-time job progress
  const [optimizationSteps, setOptimizationSteps] = useState<OptimizationStep[]>(DEFAULT_STEPS);
  const [optimizingPageTitle, setOptimizingPageTitle] = useState<string>('');
  
  // Dialog states
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedPageResult, setSelectedPageResult] = useState<{ page: DBPage; result: OptimizationResult | null } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number; status: string }>({ current: 0, total: 0, status: '' });
  
  const { wordpress, ai, neuronWriter, optimization: optimizationSettings, advanced, siteContext } = useConfigStore();

  const getLiveUrl = useCallback(
    (pageUrl: string) => {
      if (!pageUrl) return '';
      const trimmed = pageUrl.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

      const base = (wordpress.siteUrl || '').trim();
      if (!base) return trimmed;

      const normalizedBase = base.startsWith('http://') || base.startsWith('https://')
        ? base.replace(/\/+$/, '')
        : `https://${base}`.replace(/\/+$/, '');

      const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      return `${normalizedBase}${normalizedPath}`;
    },
    [wordpress.siteUrl]
  );

  // Real-time job progress hook
  const { 
    activeJob, 
    currentStepIndex, 
    watchJob, 
    stopWatching, 
    isRunning: jobIsRunning,
    isCompleted: jobIsCompleted,
    isFailed: jobIsFailed
  } = useJobProgress({
    onComplete: async (job) => {
      console.log('[PageQueue] Job completed:', job);
      setIsOptimizing(false);
      setOptimizingPageTitle('');
      await fetchPages();
      
      // Show success and open result dialog
      if (job.result) {
        const pageToShow = pages.find(p => p.id === job.pageId);
        if (pageToShow) {
          const optimization = job.result as unknown as OptimizationResult;
          setSelectedPageResult({ page: pageToShow, result: optimization });
          setShowResultDialog(true);
          toast.success('Page optimized successfully!', {
            description: `Quality score: ${optimization.qualityScore}/100`,
          });
        }
      }
    },
    onError: async (job) => {
      console.log('[PageQueue] Job failed:', job);
      setIsOptimizing(false);
      setOptimizingPageTitle('');
      await fetchPages();
      toast.error('Optimization failed', {
        description: job.errorMessage || 'Check the console for details.',
      });
    }
  });

  // Update step visualization based on real job progress
  useEffect(() => {
    if (activeJob && jobIsRunning) {
      setOptimizationSteps(prev => prev.map((s, i) => ({
        ...s,
        status: i < currentStepIndex ? 'completed' : i === currentStepIndex ? 'active' : 'pending'
      })));
    }
  }, [activeJob, currentStepIndex, jobIsRunning]);

  const fetchPages = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPages(data || []);
    } catch (error) {
      console.error('Error fetching pages:', error);
      toast.error('Failed to load pages');
    } finally {
      setIsLoading(false);
    }
  };

  // Expose refresh method to parent via ref
  useImperativeHandle(ref, () => ({
    refresh: fetchPages
  }), []);

  useEffect(() => {
    fetchPages();
  }, []);

  const togglePageSelection = (id: string) => {
    setSelectedPages(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = paginatedPages.map(p => p.id);
    const allSelected = visibleIds.every(id => selectedPages.includes(id));
    if (allSelected) {
      setSelectedPages(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedPages(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  // Start async optimization job (no client-side timeout - real-time progress via Supabase)
  const startOptimizationJob = useCallback(async (
    pageId: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> => {
    if (!wordpress.siteUrl || !wordpress.username || !wordpress.applicationPassword) {
      return { success: false, error: 'WordPress not configured' };
    }

    // Build AI configuration from user settings
    const aiConfigPayload = ai.apiKey && ai.model && ai.provider ? {
      provider: ai.provider,
      apiKey: ai.apiKey,
      model: ai.model,
    } : undefined;

    // Build NeuronWriter configuration if enabled
    const neuronWriterPayload = neuronWriter.enabled && neuronWriter.isValidated && neuronWriter.apiKey && neuronWriter.selectedProjectId ? {
      enabled: true,
      apiKey: neuronWriter.apiKey,
      projectId: neuronWriter.selectedProjectId,
      projectName: neuronWriter.selectedProjectName,
    } : undefined;

    // Call edge function - NO client timeout, job runs async
    const { data, error } = await invokeEdgeFunction<{
      success: boolean;
      message: string;
      jobId?: string;
      optimization?: OptimizationResult;
      error?: string;
    }>('optimize-content', {
      pageId,
      siteUrl: wordpress.siteUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
      aiConfig: aiConfigPayload,
      neuronWriter: neuronWriterPayload,
      advanced: {
        targetScore: advanced.targetScore,
        minWordCount: advanced.minWordCount,
        maxWordCount: advanced.maxWordCount,
        enableFaqs: advanced.enableFaqs,
        enableSchema: advanced.enableSchema,
        enableInternalLinks: advanced.enableInternalLinks,
        enableToc: advanced.enableToc,
        enableKeyTakeaways: advanced.enableKeyTakeaways,
        enableCtas: advanced.enableCtas,
      },
      siteContext: {
        organizationName: siteContext.organizationName,
        industry: siteContext.industry,
        targetAudience: siteContext.targetAudience,
        brandVoice: siteContext.brandVoice,
      },
    });

    if (error) {
      console.error(`[Optimize] Error for ${pageId}:`, error);
      return { success: false, error: error.message };
    }

    return { 
      success: data?.success || false, 
      jobId: data?.jobId,
      error: data?.error 
    };
  }, [wordpress, ai, neuronWriter, advanced, siteContext]);

  const validateOptimization = async (optimization: OptimizationResult): Promise<ValidationResult | null> => {
    const { data, error } = await invokeEdgeFunction<ValidationResult>('validate-content', {
      optimization,
      minQualityScore: 75,
    });

    if (error) {
      console.error('[Validate] Error:', error);
      return null;
    }

    return data;
  };

  const publishToWordPress = async (
    pageId: string, 
    optimization: OptimizationResult,
    publishStatus: 'draft' | 'publish' = 'draft'
  ): Promise<{ success: boolean; error?: string; postUrl?: string }> => {
    if (!wordpress.siteUrl || !wordpress.username || !wordpress.applicationPassword) {
      return { success: false, error: 'WordPress not configured' };
    }

    const { data, error } = await invokeEdgeFunction<{
      success: boolean;
      message: string;
      error?: string;
      postUrl?: string;
    }>('publish-to-wordpress', {
      pageId,
      siteUrl: wordpress.siteUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
      publishStatus,
      optimization: {
        optimizedTitle: optimization.optimizedTitle,
        metaDescription: optimization.metaDescription,
        h1: optimization.h1,
        h2s: optimization.h2s,
        optimizedContent: optimization.optimizedContent, // CRITICAL: Include full content
        schema: optimization.schema,
        internalLinks: optimization.internalLinks,
      },
      options: {
        preserveCategories: optimizationSettings.preserveCategories,
        preserveTags: optimizationSettings.preserveTags,
        preserveSlug: optimizationSettings.preserveSlug,
        preserveFeaturedImage: optimizationSettings.preserveFeaturedImage,
        updateYoast: true,
        updateRankMath: true,
      },
    });

    if (error) {
      console.error(`[Publish] Network error for ${pageId}:`, error);
      return { success: false, error: error.message || 'Network error' };
    }

    if (!data?.success) {
      console.error(`[Publish] API error for ${pageId}:`, data?.error || data?.message);
      return { success: false, error: data?.error || data?.message || 'Unknown error' };
    }

    return { success: true, postUrl: data.postUrl };
  };

  // FIX #4: WordPress connection validation before operations
  const validateWordPressConnection = useCallback(async (): Promise<{ valid: boolean; error?: string }> => {
    const { siteUrl, username, applicationPassword } = wordpress;
    
    if (!siteUrl || !username || !applicationPassword) {
      return { valid: false, error: 'WordPress credentials missing. Go to Configuration tab.' };
    }

    try {
      let normalizedUrl = siteUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      const credentials = `${username}:${applicationPassword}`;
      const authHeader = 'Basic ' + btoa(credentials);

      const response = await fetch(`${normalizedUrl}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'WP-Perfector/1.0',
        },
      });

      if (response.status === 401) {
        return { valid: false, error: 'Invalid WordPress credentials' };
      }
      if (response.status === 403) {
        return { valid: false, error: 'User lacks permissions (edit_posts required)' };
      }
      if (!response.ok) {
        return { valid: false, error: `WordPress API error: ${response.status}` };
      }

      return { valid: true };
    } catch (err) {
      return { 
        valid: false, 
        error: `Cannot connect to WordPress: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  }, [wordpress]);

  const handleOptimizeSelected = async () => {
    if (selectedPages.length === 0) {
      toast.error('Please select pages to optimize');
      return;
    }

    // Validate WordPress connection first
    toast.loading('Validating WordPress connection...');
    const wpValidation = await validateWordPressConnection();
    if (!wpValidation.valid) {
      toast.dismiss();
      toast.error('WordPress Connection Failed', {
        description: wpValidation.error,
      });
      return;
    }
    toast.dismiss();
    
    setIsOptimizing(true);
    toast.info(`Starting optimization for ${selectedPages.length} pages...`);

    let successCount = 0;
    let errorCount = 0;

    for (const pageId of selectedPages) {
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'optimizing' } : p));

      const { success } = await startOptimizationJob(pageId);

      if (success) {
        successCount++;
      } else {
        errorCount++;
      }

      if (selectedPages.indexOf(pageId) < selectedPages.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await fetchPages();
    setIsOptimizing(false);
    setSelectedPages([]);

    if (successCount > 0 && errorCount === 0) {
      toast.success(`Successfully started optimization for ${successCount} pages!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`Started ${successCount} jobs, ${errorCount} failed`);
    } else {
      toast.error(`Optimization failed for all ${errorCount} pages`);
    }
  };

  const handleOptimizeSingle = async (pageId: string) => {
    // Validate WordPress connection first
    setOptimizationSteps(prev => prev.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' })));
    
    const wpValidation = await validateWordPressConnection();
    if (!wpValidation.valid) {
      toast.error('WordPress Connection Failed', {
        description: wpValidation.error,
      });
      return;
    }

    // Find the page before starting
    const pageToOptimize = pages.find(p => p.id === pageId);
    if (!pageToOptimize) {
      toast.error('Page not found');
      return;
    }

    // Start the progress UI
    setIsOptimizing(true);
    setOptimizingPageTitle(pageToOptimize.title || pageToOptimize.slug || 'Unknown page');
    
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'optimizing' } : p));

    // Start watching for real-time job updates
    await watchJob(pageId);

    // Start the async job (no client-side timeout)
    const { success, error } = await startOptimizationJob(pageId);
    
    if (!success) {
      // Job failed to start
      setIsOptimizing(false);
      setOptimizingPageTitle('');
      await stopWatching();
      
      // Check if page was deleted (sitemap refresh) - auto-refresh the list
      if (error?.includes('Page not found') || error?.includes('PAGE_NOT_FOUND')) {
        toast.error('Page no longer exists', {
          description: 'The page list has been refreshed. This may happen after a sitemap re-crawl.',
        });
        await fetchPages();
        return;
      }
      
      await fetchPages();
      toast.error('Failed to start optimization', {
        description: error || 'Check the console for details.',
      });
    }
    // If success, the job is now running async
    // Progress updates come via real-time subscription (useJobProgress hook)
    // onComplete/onError callbacks handle the rest
  };

  const handleViewResult = async (page: DBPage) => {
    // FIX #2: Better error handling - don't use .single() which throws on no rows
    const { data: jobData, error: jobError } = await supabase
      .from('jobs')
      .select('result')
      .eq('page_id', page.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1);

    if (jobError) {
      console.error('[ViewResult] Database error:', jobError);
      toast.error('Failed to load optimization result');
      return;
    }

    const result = jobData && jobData.length > 0 
      ? (jobData[0].result as unknown as OptimizationResult | null)
      : null;
      
    if (!result) {
      toast.warning('No optimization result found', {
        description: 'Run optimization first before viewing results.',
      });
    }
    
    setSelectedPageResult({ page, result });
    setShowResultDialog(true);
  };

  const handleValidateAndPublish = async () => {
    if (!selectedPageResult?.result) return;

    const validation = await validateOptimization(selectedPageResult.result);
    setValidationResult(validation);
    setShowValidationDialog(true);
  };

  const handlePublishSingle = async (publishStatus: 'draft' | 'publish') => {
    if (!selectedPageResult?.result) return;

    setIsPublishing(true);
    const result = await publishToWordPress(
      selectedPageResult.page.id,
      selectedPageResult.result,
      publishStatus
    );
    setIsPublishing(false);

    if (result.success) {
      toast.success(`Published as ${publishStatus}!`, {
        description: result.postUrl ? `View: ${result.postUrl}` : undefined,
      });
      setShowValidationDialog(false);
      setShowResultDialog(false);
      await fetchPages();
    } else {
      toast.error('Publish failed', {
        description: result.error || 'Check console for details',
      });
    }
  };

  const handlePublishSelected = async (publishStatus: 'draft' | 'publish') => {
    const completedPages = pages.filter(
      p => selectedPages.includes(p.id) && p.status === 'completed'
    );

    if (completedPages.length === 0) {
      toast.error('No completed pages selected', {
        description: 'Only optimized pages can be published.',
      });
      return;
    }

    setShowPublishDialog(true);
    setIsPublishing(true);
    setPublishProgress({ current: 0, total: completedPages.length, status: 'Starting...' });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < completedPages.length; i++) {
      const page = completedPages[i];
      setPublishProgress({ 
        current: i + 1, 
        total: completedPages.length, 
        status: `Publishing: ${page.slug || page.title}` 
      });

      // FIX #2: Get the optimization result with proper error handling
      try {
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('result')
          .eq('page_id', page.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1);

        if (jobError) {
          console.error(`[Publish] Database error for ${page.slug}:`, jobError);
          errorCount++;
          continue;
        }

        if (!jobData || jobData.length === 0) {
          console.error(
            `[Publish] No optimization result for ${page.slug}. ` +
            `Run optimization first before publishing.`
          );
          errorCount++;
          continue;
        }

        const optimization = jobData[0]?.result as unknown as OptimizationResult | null;

        if (!optimization) {
          console.error(`[Publish] Optimization result is null/empty for ${page.slug}`);
          errorCount++;
          continue;
        }

        const result = await publishToWordPress(page.id, optimization, publishStatus);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          console.error(`[Publish] Failed for ${page.slug}:`, result.error);
        }
      } catch (err) {
        console.error(`[Publish] Unexpected error for ${page.slug}:`, err);
        errorCount++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    setIsPublishing(false);
    setShowPublishDialog(false);
    setSelectedPages([]);
    await fetchPages();

    if (successCount > 0 && errorCount === 0) {
      toast.success(`Published ${successCount} pages as ${publishStatus}!`);
    } else if (successCount > 0) {
      toast.warning(`Published ${successCount} pages, ${errorCount} failed`);
    } else {
      toast.error('All publishes failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('pages').delete().eq('id', id);
      if (error) throw error;
      setPages(prev => prev.filter(p => p.id !== id));
      setSelectedPages(prev => prev.filter(p => p !== id));
      toast.success('Page removed');
    } catch (error) {
      console.error('Error deleting page:', error);
      toast.error('Failed to delete page');
    }
  };

  const getScore = (page: DBPage): number => {
    const scoreAfter = page.score_after as { overall?: number } | null;
    const scoreBefore = page.score_before as { overall?: number } | null;
    return scoreAfter?.overall || scoreBefore?.overall || 0;
  };

  const filteredPages = pages.filter((page) => {
    const matchesSearch = page.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         page.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPages.length / ITEMS_PER_PAGE);
  const paginatedPages = filteredPages.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const visibleIds = paginatedPages.map(p => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedPages.includes(id));
  
  const selectedCompletedCount = pages.filter(
    p => selectedPages.includes(p.id) && p.status === 'completed'
  ).length;

  return (
    <>
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="w-4 h-4 text-primary" />
              Page Queue
              <span className="text-muted-foreground font-normal text-sm">
                ({pages.length} pages)
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedPages.length > 0 && (
                <>
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    onClick={handleOptimizeSelected}
                    disabled={isOptimizing || isPublishing}
                  >
                    {isOptimizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    {isOptimizing ? 'Optimizing...' : `Optimize ${selectedPages.length}`}
                  </Button>
                  {selectedCompletedCount > 0 && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1"
                        onClick={() => handlePublishSelected('draft')}
                        disabled={isOptimizing || isPublishing}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Save as Draft ({selectedCompletedCount})
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1 bg-green-600 hover:bg-green-700"
                        onClick={() => handlePublishSelected('publish')}
                        disabled={isOptimizing || isPublishing}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Publish ({selectedCompletedCount})
                      </Button>
                    </div>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={fetchPages}
                disabled={isLoading}
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 w-48 h-8 bg-muted/50"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-32 h-8 bg-muted/50">
                  <Filter className="w-3 h-3 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="optimizing">Optimizing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No pages in queue</p>
              <p className="text-sm">Crawl a sitemap to add pages</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={selectAllVisible}
                        />
                      </TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-20 text-center">Score</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {paginatedPages.map((page) => (
                        <motion.tr
                          key={page.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedPages.includes(page.id)}
                              onCheckedChange={() => togglePageSelection(page.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium truncate max-w-[300px]">{page.slug || page.url}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {page.title}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <ScoreIndicator score={getScore(page)} size="sm" />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={page.status as any || 'pending'} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {(page.status === 'pending' || !page.status) && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7" 
                                  title="Quick Optimize"
                                  onClick={() => handleOptimizeSingle(page.id)}
                                  disabled={isOptimizing}
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {page.status === 'optimizing' && (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              )}
                              {page.status === 'failed' && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7" 
                                  title="Retry"
                                  onClick={() => handleOptimizeSingle(page.id)}
                                  disabled={isOptimizing}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {(page.status === 'completed' || page.status === 'published') && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7" 
                                    title="View Results & Publish"
                                    onClick={() => handleViewResult(page)}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                  {page.status === 'completed' && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 text-green-500 hover:text-green-600" 
                                      title="Quick Publish"
                                      onClick={async () => {
                                        const { data: jobData } = await supabase
                                          .from('jobs')
                                          .select('result')
                                          .eq('page_id', page.id)
                                          .eq('status', 'completed')
                                          .order('completed_at', { ascending: false })
                                          .limit(1)
                                          .single();
                                        
                                        if (jobData?.result) {
                                          setSelectedPageResult({ page, result: jobData.result as unknown as OptimizationResult });
                                          handleValidateAndPublish();
                                        }
                                      }}
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                              {page.status === 'published' && (
                                <CheckCheck className="w-4 h-4 text-green-500" />
                              )}
                              <a
                                href={getLiveUrl(page.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                                title="Open live page"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Preview Optimized Content"
                                onClick={() => handleViewResult(page)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(page.id)}
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {paginatedPages.length} of {filteredPages.length}
                  {selectedPages.length > 0 && ` • ${selectedPages.length} selected`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'ghost'}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Content Preview Dialog - Enterprise Grade */}
      <ContentPreviewDialog
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        pageTitle={selectedPageResult?.page.title || ''}
        pageUrl={getLiveUrl(selectedPageResult?.page.url || '')}
        result={selectedPageResult?.result || null}
        onPublish={selectedPageResult?.page.status !== 'published' ? handleValidateAndPublish : undefined}
        isPublishing={isPublishing}
      />

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationResult?.canPublish ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              Content Validation
            </DialogTitle>
            <DialogDescription>
              Pre-publish quality checks
            </DialogDescription>
          </DialogHeader>

          {validationResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">Overall Score</span>
                <span className="text-lg font-bold">{validationResult.overallScore}%</span>
              </div>

              <div className="flex gap-2">
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" /> {validationResult.summary.errors} Errors
                </Badge>
                <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-600">
                  <AlertTriangle className="w-3 h-3" /> {validationResult.summary.warnings} Warnings
                </Badge>
                <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600">
                  <CheckCircle2 className="w-3 h-3" /> {validationResult.summary.passed} Passed
                </Badge>
              </div>

              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {validationResult.checks.map((check, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "p-2 rounded-lg text-sm flex items-center justify-between",
                        check.passed ? "bg-green-500/10" : 
                          check.severity === 'error' ? "bg-red-500/10" : "bg-yellow-500/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : check.severity === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        )}
                        <span>{check.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {check.actual} <span className="text-xs">({check.expected})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="secondary"
              onClick={() => handlePublishSingle('draft')}
              disabled={isPublishing}
            >
              {isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Save as Draft
            </Button>
            <Button 
              onClick={() => handlePublishSingle('publish')}
              disabled={isPublishing || !validationResult?.canPublish}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Publish Progress Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary animate-pulse" />
              Publishing to WordPress
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Progress value={(publishProgress.current / publishProgress.total) * 100} />
            <p className="text-sm text-center text-muted-foreground">
              {publishProgress.current} of {publishProgress.total} pages
            </p>
            <p className="text-sm text-center truncate">{publishProgress.status}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enterprise-grade Optimization Progress Bar */}
      <OptimizationProgress
        isActive={isOptimizing}
        currentStep={currentStepIndex}
        steps={optimizationSteps}
        pageTitle={optimizingPageTitle}
        serverProgress={activeJob?.progress ?? 0}
        serverStepName={activeJob?.currentStep}
        errorMessage={activeJob?.errorMessage}
        onDismiss={() => {
          setIsOptimizing(false);
          setOptimizingPageTitle('');
          stopWatching();
        }}
      />
    </>
  );
});
