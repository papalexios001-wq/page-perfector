import { useState } from 'react';
import { motion } from 'framer-motion';
import { Map, Loader2, Filter, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePagesStore, PageRecord } from '@/stores/pages-store';

export function SitemapCrawler() {
  const { addPages } = usePagesStore();
  const [sitemapUrl, setSitemapUrl] = useState('/sitemap.xml');
  const [postType, setPostType] = useState('post');
  const [maxPages, setMaxPages] = useState('100');
  const [excludeOptimized, setExcludeOptimized] = useState(false);
  const [lowScoreOnly, setLowScoreOnly] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [foundCount, setFoundCount] = useState<number | null>(null);

  const handleCrawl = async () => {
    setIsCrawling(true);
    
    // Simulate crawling
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate mock pages
    const mockPages: PageRecord[] = Array.from({ length: Math.min(parseInt(maxPages), 15) }, (_, i) => ({
      id: Math.random().toString(36).substring(2, 15),
      url: `/article-${i + 1}`,
      slug: `article-${i + 1}`,
      title: `Sample Article ${i + 1}`,
      wordCount: Math.floor(Math.random() * 2000) + 500,
      status: 'pending' as const,
      scoreBefore: {
        overall: Math.floor(Math.random() * 60) + 20,
        components: {
          contentDepth: Math.floor(Math.random() * 100),
          readability: Math.floor(Math.random() * 100),
          structure: Math.floor(Math.random() * 100),
          seoOnPage: Math.floor(Math.random() * 100),
          internalLinks: Math.floor(Math.random() * 100),
          schemaMarkup: Math.floor(Math.random() * 100),
          engagement: Math.floor(Math.random() * 100),
          eeat: Math.floor(Math.random() * 100),
        },
      },
      postType,
      categories: ['General'],
      tags: [],
      retryCount: 0,
    }));

    addPages(mockPages);
    setFoundCount(mockPages.length);
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
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sitemap URL</Label>
          <Input
            placeholder="/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="bg-muted/50"
          />
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
          disabled={isCrawling}
          className="w-full gap-2"
        >
          {isCrawling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Map className="w-4 h-4" />
          )}
          {isCrawling ? 'Crawling...' : 'Crawl Sitemap'}
        </Button>

        {foundCount !== null && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground text-center"
          >
            Found: <span className="text-primary font-mono">{foundCount}</span> pages
          </motion.p>
        )}
      </CardContent>
    </Card>
  );
}
