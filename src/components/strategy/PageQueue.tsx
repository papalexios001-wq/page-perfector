import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  List, Search, Filter, Zap, Eye, Trash2, RotateCcw, FileText, 
  ChevronLeft, ChevronRight, RefreshCw, Loader2, CheckCircle2, 
  XCircle, Upload, Send, AlertTriangle, Info, CheckCheck
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
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/supabase';
import { useConfigStore } from '@/stores/config-store';
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
  optimizedContent?: string; // Full optimized HTML content for publishing
  contentStrategy: {
    wordCount: number;
    readabilityScore: number;
    keywordDensity: number;
    lsiKeywords: string[];
  };
  internalLinks: Array<{ anchor: string; target: string; position: number }>;
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

export function PageQueue() {
  const [pages, setPages] = useState<DBPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Progress bar state
  const [optimizationSteps, setOptimizationSteps] = useState<OptimizationStep[]>(DEFAULT_STEPS);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [optimizingPageTitle, setOptimizingPageTitle] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Dialog states
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedPageResult, setSelectedPageResult] = useState<{ page: DBPage; result: OptimizationResult | null } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number; status: string }>({ current: 0, total: 0, status: '' });
  
  const { wordpress, optimization: optimizationSettings } = useConfigStore();

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

  const optimizeSinglePage = useCallback(async (
    pageId: string,
    onStepChange?: (step: number) => void
  ): Promise<{ success: boolean; optimization?: OptimizationResult; error?: string }> => {
    if (!wordpress.siteUrl || !wordpress.username || !wordpress.applicationPassword) {
      return { success: false, error: 'WordPress not configured' };
    }

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Update step: Fetching content (step 1)
    onStepChange?.(1);

    const { data, error } = await invokeEdgeFunction<{
      success: boolean;
      message: string;
      optimization?: OptimizationResult;
      error?: string;
    }>('optimize-content', {
      pageId,
      siteUrl: wordpress.siteUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
    }, {
      signal: abortControllerRef.current.signal,
      timeoutMs: 90000, // 90 second timeout
    });

    if (error) {
      console.error(`[Optimize] Error for ${pageId}:`, error);
      
      // Handle timeout specifically
      if (error.code === 'TIMEOUT_ERROR') {
        // Reset the page status to failed
        await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
      }
      
      return { success: false, error: error.message };
    }

    // Update step: Saving results (step 4)
    onStepChange?.(4);

    return { 
      success: data?.success || false, 
      optimization: data?.optimization,
      error: data?.error 
    };
  }, [wordpress]);

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

      const { success } = await optimizeSinglePage(pageId);

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
      toast.success(`Successfully optimized ${successCount} pages!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`Optimized ${successCount} pages, ${errorCount} failed`);
    } else {
      toast.error(`Optimization failed for all ${errorCount} pages`);
    }
  };

  const handleOptimizationTimeout = useCallback(async () => {
    // Abort the current request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setIsOptimizing(false);
    setCurrentStepIndex(0);
    setOptimizingPageTitle('');
    
    toast.error('Optimization timed out', {
      description: 'The request took too long (>90 seconds). Please try again.',
    });
    
    await fetchPages();
  }, []);

  const handleOptimizeSingle = async (pageId: string) => {
    // Validate WordPress connection first
    setCurrentStepIndex(0);
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
    setCurrentStepIndex(0);
    
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'optimizing' } : p));

    // Step progress callback
    const handleStepChange = (step: number) => {
      setCurrentStepIndex(step);
      setOptimizationSteps(prev => prev.map((s, i) => ({
        ...s,
        status: i < step ? 'completed' : i === step ? 'active' : 'pending'
      })));
    };

    // Start with step 0 (validating)
    handleStepChange(0);
    
    // Simulate step progression for AI analysis (step 2)
    setTimeout(() => handleStepChange(2), 3000);
    
    // Simulate step progression for generating (step 3)
    setTimeout(() => handleStepChange(3), 15000);

    const { success, optimization, error } = await optimizeSinglePage(pageId, handleStepChange);
    
    // Complete the progress
    setIsOptimizing(false);
    setCurrentStepIndex(0);
    setOptimizingPageTitle('');
    
    // Fetch fresh pages data
    await fetchPages();

    if (success && optimization) {
      // Mark all steps as completed
      setOptimizationSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
      
      setSelectedPageResult({ 
        page: { ...pageToOptimize, status: 'completed' }, 
        result: optimization 
      });
      setShowResultDialog(true);
      toast.success('Page optimized successfully!', {
        description: `Quality score: ${optimization.qualityScore}/100`,
      });
    } else {
      toast.error('Optimization failed', {
        description: error || 'Check the console for details.',
      });
    }
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Preview"
                                onClick={() => window.open(page.url, '_blank')}
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

      {/* Optimization Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Optimization Results
            </DialogTitle>
            <DialogDescription>
              {selectedPageResult?.page.title}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] pr-4">
            {selectedPageResult?.result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Quality Score</p>
                    <p className="text-2xl font-bold text-primary">{selectedPageResult.result.qualityScore}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Estimated Rank</p>
                    <p className="text-2xl font-bold">#{selectedPageResult.result.estimatedRankPosition}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2">Optimized Title</p>
                  <p className="text-sm p-2 rounded bg-muted/50">{selectedPageResult.result.optimizedTitle}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPageResult.result.optimizedTitle.length} characters
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Meta Description</p>
                  <p className="text-sm p-2 rounded bg-muted/50">{selectedPageResult.result.metaDescription}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPageResult.result.metaDescription.length} characters
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">H1 Heading</p>
                  <p className="text-sm p-2 rounded bg-muted/50">{selectedPageResult.result.h1}</p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Subheadings (H2)</p>
                  <ul className="space-y-1">
                    {selectedPageResult.result.h2s.map((h2, i) => (
                      <li key={i} className="text-sm p-2 rounded bg-muted/50">• {h2}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">LSI Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedPageResult.result.contentStrategy.lsiKeywords.map((kw, i) => (
                      <Badge key={i} variant="secondary">{kw}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">AI Suggestions</p>
                  <div className="space-y-2 text-sm">
                    <p className="p-2 rounded bg-muted/50">
                      <strong>Quick Wins:</strong> {selectedPageResult.result.aiSuggestions.quickWins}
                    </p>
                    <p className="p-2 rounded bg-muted/50">
                      <strong>Content Gaps:</strong> {selectedPageResult.result.aiSuggestions.contentGaps}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No optimization data available</p>
            )}
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              Close
            </Button>
            {selectedPageResult?.result && selectedPageResult.page.status !== 'published' && (
              <Button onClick={handleValidateAndPublish} disabled={isPublishing}>
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Validate & Publish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        onTimeout={handleOptimizationTimeout}
        timeoutMs={90000}
      />
    </>
  );
}
