import { useState } from 'react';
import { motion } from 'framer-motion';
import { Map, Loader2, AlertCircle, CheckCircle2, CloudOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePagesStore, PageRecord } from '@/stores/pages-store';
import { useConfigStore } from '@/stores/config-store';
import { invokeEdgeFunction, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CrawlResult {
  success: boolean;
  message: string;
  pages: any[];
  totalFound: number;
  errors: string[];
}

export function SitemapCrawler() {
  const { addPages, clearPages, addActivityLog } = usePagesStore();
  const { wordpress } = useConfigStore();
  const [sitemapUrl, setSitemapUrl] = useState('/sitemap.xml');
  const [postType, setPostType] = useState('post');
  const [maxPages, setMaxPages] = useState('100');
  const [excludeOptimized, setExcludeOptimized] = useState(false);
  const [lowScoreOnly, setLowScoreOnly] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  const backendConfigured = isSupabaseConfigured();
  const wpConnected = wordpress.isConnected;
  const canCrawl = backendConfigured && wpConnected;

  const handleCrawl = async () => {
    // CRITICAL: Do NOT allow crawling without proper configuration
    if (!wordpress.siteUrl) {
      toast.error('Please configure WordPress connection first', {
        description: 'Go to Configuration tab and connect your WordPress site',
      });
      return;
    }

    if (!wpConnected) {
      toast.error('WordPress not connected', {
        description: 'Please test your WordPress connection before crawling',
      });
      return;
    }

    if (!backendConfigured) {
      toast.error('Backend runtime not configured', {
        description: 'Please connect Lovable Cloud to enable sitemap crawling',
      });
      return;
    }

    setIsCrawling(true);
    setCrawlResult(null);

    addActivityLog({
      type: 'info',
      pageUrl: sitemapUrl,
      message: 'Starting sitemap crawl...',
    });

    const { data, error } = await invokeEdgeFunction<CrawlResult>('crawl-sitemap', {
      siteUrl: wordpress.siteUrl,
      sitemapPath: sitemapUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
      postType,
      maxPages: parseInt(maxPages),
      excludeOptimized,
      lowScoreOnly,
    });

    if (error) {
      console.error('Sitemap crawl error:', error);
      setCrawlResult({
        success: false,
        message: error.message,
        pages: [],
        totalFound: 0,
        errors: [error.message],
      });

      addActivityLog({
        type: 'error',
        pageUrl: sitemapUrl,
        message: `Sitemap crawl failed: ${error.message}`,
      });

      toast.error('Crawl failed', {
        description: error.message,
      });
      setIsCrawling(false);
      return;
    }

    const result = data!;
    setCrawlResult(result);

    if (result.success && result.pages.length > 0) {
      // Convert API response to PageRecord format
      const pageRecords: PageRecord[] = result.pages.map((page) => ({
        id: page.id,
        url: page.url,
        slug: page.slug,
        title: page.title,
        wordCount: page.wordCount || 0,
        status: 'pending' as const,
        scoreBefore: page.scoreBefore,
        postId: page.postId,
        postType: page.postType || postType,
        categories: page.categories || [],
        tags: page.tags || [],
        featuredImage: page.featuredImage,
        retryCount: 0,
      }));

      // Clear existing and add new pages
      clearPages();
      addPages(pageRecords);

      addActivityLog({
        type: 'success',
        pageUrl: sitemapUrl,
        message: `Successfully crawled ${result.pages.length} pages from sitemap`,
        details: { totalFound: result.totalFound, processed: result.pages.length },
      });

      toast.success(`Found ${result.pages.length} pages!`, {
        description: `Total in sitemap: ${result.totalFound}`,
      });
    } else if (result.success && result.pages.length === 0) {
      toast.warning('No pages found', {
        description: 'The sitemap was accessible but contained no matching URLs',
      });
    } else {
      addActivityLog({
        type: 'error',
        pageUrl: sitemapUrl,
        message: result.message || 'Failed to crawl sitemap',
      });

      toast.error('Crawl failed', {
        description: result.message || 'Could not fetch sitemap',
      });
    }

    setIsCrawling(false);
  };

  return (
    <Card className="glass-panel border-border/50 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" />
          Sitemap Crawler
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Backend not configured warning */}
        {!backendConfigured && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-2 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2"
          >
            <CloudOff className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-warning">Connect Lovable Cloud to enable crawling</p>
          </motion.div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sitemap URL</Label>
          <Input
            placeholder="/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="bg-muted/50"
          />
          {!wpConnected && backendConfigured && (
            <p className="text-xs text-warning flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Connect WordPress first
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Post Type</Label>
            <Select value={postType} onValueChange={setPostType}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="page">Pages</SelectItem>
                <SelectItem value="product">Products</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Max Pages</Label>
            <Select value={maxPages} onValueChange={setMaxPages}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Exclude optimized</Label>
            <Switch checked={excludeOptimized} onCheckedChange={setExcludeOptimized} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Score &lt; 70 only</Label>
            <Switch checked={lowScoreOnly} onCheckedChange={setLowScoreOnly} />
          </div>
        </div>

        <Button
          onClick={handleCrawl}
          disabled={isCrawling || !canCrawl}
          className="w-full gap-2"
        >
          {isCrawling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Map className="w-4 h-4" />
          )}
          {isCrawling ? 'Crawling...' : 'Crawl Sitemap'}
        </Button>

        {crawlResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              'p-2 rounded-lg text-sm text-center',
              crawlResult.success 
                ? 'bg-success/10 text-success' 
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {crawlResult.success ? (
              <span className="flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Found: <span className="font-mono font-bold">{crawlResult.pages.length}</span> pages
                {crawlResult.totalFound > crawlResult.pages.length && (
                  <span className="text-muted-foreground">
                    (of {crawlResult.totalFound})
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {crawlResult.message}
              </span>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
