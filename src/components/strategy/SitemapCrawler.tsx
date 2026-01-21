import { useState } from 'react';
import { motion } from 'framer-motion';
import { Map, Loader2, AlertCircle, CheckCircle2, CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePagesStore } from '@/stores/pages-store';
import { useConfigStore } from '@/stores/config-store';
import { invokeEdgeFunction, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CrawlResult {
  success: boolean;
  message: string;
  pagesAdded: number;
  pagesKept: number;
  pagesDeleted: number;
  totalFound: number;
  errors?: string[];
}

interface SitemapCrawlerProps {
  onCrawlComplete?: () => void;
}

export function SitemapCrawler({ onCrawlComplete }: SitemapCrawlerProps) {
  const { addActivityLog } = usePagesStore();
  const { wordpress } = useConfigStore();
  const [sitemapUrl, setSitemapUrl] = useState('/sitemap.xml');
  const [postType, setPostType] = useState('post');
  const [maxPages, setMaxPages] = useState('0'); // 0 = ALL
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
      message: 'Starting sitemap crawl (replacing non-optimized pages)...',
    });

    const { data, error } = await invokeEdgeFunction<CrawlResult>('crawl-sitemap', {
      siteId: wordpress.siteId,
      siteUrl: wordpress.siteUrl,
      sitemapPath: sitemapUrl,
      username: wordpress.username,
      applicationPassword: wordpress.applicationPassword,
      postType,
      maxPages: parseInt(maxPages), // 0 = ALL
      replaceExisting: true, // Always replace non-optimized pages
      excludeOptimized,
      lowScoreOnly,
    });

    if (error) {
      console.error('Sitemap crawl error:', error);
      setCrawlResult({
        success: false,
        message: error.message,
        pagesAdded: 0,
        pagesKept: 0,
        pagesDeleted: 0,
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

    if (result.success && (result.pagesAdded > 0 || result.pagesKept > 0)) {
      addActivityLog({
        type: 'success',
        pageUrl: sitemapUrl,
        message: `Crawl complete: ${result.pagesAdded} new, ${result.pagesKept} kept, ${result.pagesDeleted} replaced`,
        details: { 
          totalFound: result.totalFound, 
          pagesAdded: result.pagesAdded,
          pagesKept: result.pagesKept,
          pagesDeleted: result.pagesDeleted,
        },
      });

      toast.success(`Sitemap crawl complete!`, {
        description: `${result.pagesAdded} new pages added, ${result.pagesKept} optimized pages kept`,
      });
      
      // Notify parent to refresh page list
      onCrawlComplete?.();
    } else if (result.success && result.pagesAdded === 0) {
      toast.warning('No new pages added', {
        description: result.pagesKept > 0 
          ? `All ${result.pagesKept} pages are already optimized` 
          : 'The sitemap was accessible but contained no matching URLs',
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

        {/* Info about replace behavior */}
        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <span className="text-primary font-medium">Smart Replace Mode:</span> Keeps optimized pages, replaces everything else with fresh sitemap data.
          </div>
        </div>

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
                <SelectItem value="0">All URLs</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
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
            <RefreshCw className="w-4 h-4" />
          )}
          {isCrawling ? 'Crawling...' : 'Crawl & Replace'}
        </Button>

        {crawlResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              'p-3 rounded-lg text-sm',
              crawlResult.success 
                ? 'bg-success/10 border border-success/30' 
                : 'bg-destructive/10 border border-destructive/30'
            )}
          >
            {crawlResult.success ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-success font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Crawl Complete
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Total in sitemap:</span>
                  <span className="font-mono font-medium text-foreground">{crawlResult.totalFound}</span>
                  
                  <span>New pages added:</span>
                  <span className="font-mono font-medium text-success">{crawlResult.pagesAdded}</span>
                  
                  <span>Optimized kept:</span>
                  <span className="font-mono font-medium text-primary">{crawlResult.pagesKept}</span>
                  
                  <span>Old pages replaced:</span>
                  <span className="font-mono font-medium text-warning">{crawlResult.pagesDeleted}</span>
                </div>
              </div>
            ) : (
              <span className="flex items-center justify-center gap-1 text-destructive">
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
