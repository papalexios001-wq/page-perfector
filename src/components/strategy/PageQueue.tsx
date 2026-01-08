import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, Search, Filter, Zap, Eye, Trash2, RotateCcw, FileText, ChevronLeft, ChevronRight, RefreshCw, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ScoreIndicator } from '@/components/shared/ScoreIndicator';
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

interface OptimizationProgress {
  pageId: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
}

export function PageQueue() {
  const [pages, setPages] = useState<DBPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState<OptimizationProgress[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  
  const { wordpress } = useConfigStore();

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

  const optimizeSinglePage = useCallback(async (pageId: string): Promise<boolean> => {
    if (!wordpress.siteUrl || !wordpress.username || !wordpress.applicationPassword) {
      return false;
    }

    const { data, error } = await invokeEdgeFunction<{
      success: boolean;
      message: string;
      optimization?: Record<string, unknown>;
    }>('optimize-content', {
      pageId,
      siteUrl: wordpress.siteUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
    });

    if (error) {
      console.error(`[Optimize] Error for ${pageId}:`, error);
      return false;
    }

    return data?.success || false;
  }, [wordpress]);

  const handleOptimizeSelected = async () => {
    if (selectedPages.length === 0) {
      toast.error('Please select pages to optimize');
      return;
    }

    if (!wordpress.isConnected || !wordpress.siteUrl) {
      toast.error('WordPress not connected', {
        description: 'Go to Configuration tab and connect your WordPress site first.',
      });
      return;
    }

    setIsOptimizing(true);
    const initialProgress = selectedPages.map(id => ({ pageId: id, status: 'pending' as const }));
    setOptimizationProgress(initialProgress);

    toast.info(`Starting optimization for ${selectedPages.length} pages...`);

    let successCount = 0;
    let errorCount = 0;

    // Process pages sequentially to avoid rate limits
    for (const pageId of selectedPages) {
      // Update progress to running
      setOptimizationProgress(prev => 
        prev.map(p => p.pageId === pageId ? { ...p, status: 'running' } : p)
      );

      // Update page status in local state
      setPages(prev => 
        prev.map(p => p.id === pageId ? { ...p, status: 'optimizing' } : p)
      );

      const success = await optimizeSinglePage(pageId);

      if (success) {
        successCount++;
        setOptimizationProgress(prev => 
          prev.map(p => p.pageId === pageId ? { ...p, status: 'success', message: 'Optimized' } : p)
        );
      } else {
        errorCount++;
        setOptimizationProgress(prev => 
          prev.map(p => p.pageId === pageId ? { ...p, status: 'error', message: 'Failed' } : p)
        );
      }

      // Small delay between requests to be nice to the API
      if (selectedPages.indexOf(pageId) < selectedPages.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Refresh pages from database to get updated statuses
    await fetchPages();

    setIsOptimizing(false);
    setSelectedPages([]);
    setOptimizationProgress([]);

    if (successCount > 0 && errorCount === 0) {
      toast.success(`Successfully optimized ${successCount} pages!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`Optimized ${successCount} pages, ${errorCount} failed`);
    } else {
      toast.error(`Optimization failed for all ${errorCount} pages`);
    }
  };

  const handleOptimizeSingle = async (pageId: string) => {
    if (!wordpress.isConnected || !wordpress.siteUrl) {
      toast.error('WordPress not connected');
      return;
    }

    setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'optimizing' } : p));
    toast.info('Starting optimization...');

    const success = await optimizeSinglePage(pageId);
    
    await fetchPages();

    if (success) {
      toast.success('Page optimized successfully!');
    } else {
      toast.error('Optimization failed');
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

  return (
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
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={handleOptimizeSelected}
                disabled={isOptimizing}
              >
                {isOptimizing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {isOptimizing ? 'Optimizing...' : `Optimize ${selectedPages.length} Selected`}
              </Button>
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
                <SelectItem value="analyzing">Analyzing</SelectItem>
                <SelectItem value="optimizing">Optimizing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
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
                    <TableHead className="w-28 text-right">Actions</TableHead>
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
                            {page.status === 'completed' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Result">
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
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
  );
}
