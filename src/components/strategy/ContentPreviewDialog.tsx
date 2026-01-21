import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ExternalLink, Copy, Check, Zap, Target, FileText, 
  Link2, MessageCircle, Youtube, BookOpen, TrendingUp,
  Award, Clock, Globe
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  schema: Record<string, unknown>;
  aiSuggestions: {
    contentGaps: string;
    quickWins: string;
    improvements: string[];
  };
  qualityScore: number;
  estimatedRankPosition: number;
  confidenceLevel: number;
  references?: Array<{ title: string; url: string; snippet?: string }>;
  youtubeVideo?: { title: string; videoId: string; embedHtml?: string; description?: string };
}

interface ContentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageTitle: string;
  pageUrl: string;
  result: OptimizationResult | null;
  onPublish?: () => void;
  isPublishing?: boolean;
}

export function ContentPreviewDialog({
  open,
  onOpenChange,
  pageTitle,
  pageUrl,
  result,
  onPublish,
  isPublishing,
}: ContentPreviewDialogProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');

  const handleCopyContent = async () => {
    if (result?.optimizedContent) {
      await navigator.clipboard.writeText(result.optimizedContent);
      setCopied(true);
      toast.success('Content copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-primary';
    if (score >= 80) return 'text-success';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 90) return 'from-primary/20 to-info/20 border-primary/30';
    if (score >= 80) return 'from-success/20 to-emerald-500/20 border-success/30';
    if (score >= 70) return 'from-yellow-400/20 to-amber-500/20 border-yellow-400/30';
    if (score >= 60) return 'from-warning/20 to-orange-500/20 border-warning/30';
    return 'from-destructive/20 to-red-500/20 border-destructive/30';
  };

  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/50 bg-gradient-to-r from-card to-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold mb-1 line-clamp-1">
                {result.optimizedTitle || pageTitle}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="w-3.5 h-3.5" />
                <a 
                  href={pageUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors truncate max-w-md"
                >
                  {pageUrl}
                </a>
              </div>
            </div>
            
            {/* Score Badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                'flex flex-col items-center p-3 rounded-xl bg-gradient-to-br border',
                getScoreGradient(result.qualityScore)
              )}
            >
              <span className={cn('text-2xl font-bold font-mono', getScoreColor(result.qualityScore))}>
                {result.qualityScore}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Quality Score
              </span>
            </motion.div>
          </div>
        </DialogHeader>

        {/* Stats Bar */}
        <div className="px-6 py-3 border-b border-border/30 bg-muted/20 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono">{result.contentStrategy?.wordCount?.toLocaleString() || 0}</span>
            <span className="text-xs text-muted-foreground">words</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-info" />
            <span className="text-sm font-mono">{result.internalLinks?.length || 0}</span>
            <span className="text-xs text-muted-foreground">internal links</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm font-mono">#{result.estimatedRankPosition || '—'}</span>
            <span className="text-xs text-muted-foreground">est. rank</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-warning" />
            <span className="text-sm font-mono">{Math.round((result.confidenceLevel || 0) * 100)}%</span>
            <span className="text-xs text-muted-foreground">confidence</span>
          </div>
          {result.youtubeVideo && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <Youtube className="w-4 h-4 text-red-500" />
                <span className="text-xs text-muted-foreground">YouTube embedded</span>
              </div>
            </>
          )}
          {result.references && result.references.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-mono">{result.references.length}</span>
                <span className="text-xs text-muted-foreground">references</span>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3">
            <TabsList className="grid w-full max-w-md grid-cols-4 bg-muted/50">
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="seo" className="gap-1.5 text-xs">
                <Target className="w-3.5 h-3.5" />
                SEO
              </TabsTrigger>
              <TabsTrigger value="links" className="gap-1.5 text-xs">
                <Link2 className="w-3.5 h-3.5" />
                Links
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="gap-1.5 text-xs">
                <Zap className="w-3.5 h-3.5" />
                AI Insights
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 mt-3">
            {/* Preview Tab */}
            <TabsContent value="preview" className="h-full mt-0">
              <ScrollArea className="h-[50vh] px-6">
                <article 
                  className="prose prose-invert prose-cyan max-w-none pb-6
                    prose-headings:font-bold prose-headings:tracking-tight
                    prose-h1:text-2xl prose-h1:mb-4 prose-h1:text-foreground
                    prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-foreground
                    prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-foreground
                    prose-p:text-muted-foreground prose-p:leading-relaxed
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-foreground prose-strong:font-semibold
                    prose-ul:text-muted-foreground prose-ol:text-muted-foreground
                    prose-li:marker:text-primary
                    prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
                    [&_.wp-opt-tldr]:bg-primary/10 [&_.wp-opt-tldr]:border [&_.wp-opt-tldr]:border-primary/30 [&_.wp-opt-tldr]:rounded-lg [&_.wp-opt-tldr]:p-4 [&_.wp-opt-tldr]:my-6
                    [&_.wp-opt-takeaways]:bg-info/10 [&_.wp-opt-takeaways]:border [&_.wp-opt-takeaways]:border-info/30 [&_.wp-opt-takeaways]:rounded-lg [&_.wp-opt-takeaways]:p-4 [&_.wp-opt-takeaways]:my-6
                    [&_.wp-opt-tip]:bg-success/10 [&_.wp-opt-tip]:border [&_.wp-opt-tip]:border-success/30 [&_.wp-opt-tip]:rounded-lg [&_.wp-opt-tip]:p-4 [&_.wp-opt-tip]:my-4
                    [&_.wp-opt-warning]:bg-warning/10 [&_.wp-opt-warning]:border [&_.wp-opt-warning]:border-warning/30 [&_.wp-opt-warning]:rounded-lg [&_.wp-opt-warning]:p-4 [&_.wp-opt-warning]:my-4
                    [&_.wp-opt-stat]:bg-primary/5 [&_.wp-opt-stat]:border-l-4 [&_.wp-opt-stat]:border-l-primary [&_.wp-opt-stat]:pl-4 [&_.wp-opt-stat]:py-2 [&_.wp-opt-stat]:my-4
                    [&_.wp-opt-quote]:bg-muted/50 [&_.wp-opt-quote]:border-l-4 [&_.wp-opt-quote]:border-l-info [&_.wp-opt-quote]:pl-4 [&_.wp-opt-quote]:py-3 [&_.wp-opt-quote]:my-6 [&_.wp-opt-quote]:rounded-r-lg
                    [&_.wp-opt-faq]:bg-muted/30 [&_.wp-opt-faq]:border [&_.wp-opt-faq]:border-border/50 [&_.wp-opt-faq]:rounded-lg [&_.wp-opt-faq]:p-4 [&_.wp-opt-faq]:my-3
                    [&_.wp-opt-cta]:bg-gradient-to-r [&_.wp-opt-cta]:from-primary/20 [&_.wp-opt-cta]:to-info/20 [&_.wp-opt-cta]:border [&_.wp-opt-cta]:border-primary/30 [&_.wp-opt-cta]:rounded-xl [&_.wp-opt-cta]:p-6 [&_.wp-opt-cta]:my-6 [&_.wp-opt-cta]:text-center
                    [&_.wp-opt-references]:bg-muted/20 [&_.wp-opt-references]:border [&_.wp-opt-references]:border-border/50 [&_.wp-opt-references]:rounded-lg [&_.wp-opt-references]:p-6 [&_.wp-opt-references]:my-8
                    [&_.wp-opt-youtube]:my-8 [&_.wp-opt-youtube]:rounded-xl [&_.wp-opt-youtube]:overflow-hidden [&_.wp-opt-youtube]:shadow-lg
                  "
                  dangerouslySetInnerHTML={{ __html: result.optimizedContent || '<p>No content available</p>' }}
                />
              </ScrollArea>
            </TabsContent>

            {/* SEO Tab */}
            <TabsContent value="seo" className="h-full mt-0">
              <ScrollArea className="h-[50vh] px-6">
                <div className="space-y-6 pb-6">
                  {/* Title & Meta */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        SEO Title <Badge variant="outline" className="ml-2">{result.optimizedTitle?.length || 0}/60</Badge>
                      </label>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="font-medium text-blue-400">{result.optimizedTitle}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Meta Description <Badge variant="outline" className="ml-2">{result.metaDescription?.length || 0}/160</Badge>
                      </label>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-sm text-muted-foreground">{result.metaDescription}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        H1 Heading
                      </label>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="font-bold">{result.h1}</p>
                      </div>
                    </div>
                  </div>

                  {/* H2s */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      H2 Headings <Badge variant="outline" className="ml-2">{result.h2s?.length || 0}</Badge>
                    </label>
                    <div className="grid gap-2">
                      {result.h2s?.map((h2, i) => (
                        <div key={i} className="p-2 rounded bg-muted/20 border border-border/30 text-sm">
                          <span className="text-primary font-mono mr-2">#{i + 1}</span>
                          {h2}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Keywords */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LSI Keywords
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {result.contentStrategy?.lsiKeywords?.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Content Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center">
                      <div className="text-2xl font-bold text-primary font-mono">
                        {result.contentStrategy?.readabilityScore || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Readability</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center">
                      <div className="text-2xl font-bold text-info font-mono">
                        {result.contentStrategy?.keywordDensity?.toFixed(1) || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">Keyword Density</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center">
                      <div className="text-2xl font-bold text-success font-mono">
                        {result.contentStrategy?.wordCount?.toLocaleString() || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Words</div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Links Tab */}
            <TabsContent value="links" className="h-full mt-0">
              <ScrollArea className="h-[50vh] px-6">
                <div className="space-y-6 pb-6">
                  {/* Internal Links */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-info" />
                      Internal Links ({result.internalLinks?.length || 0})
                    </h4>
                    <div className="space-y-2">
                      {result.internalLinks?.map((link, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="p-3 rounded-lg bg-muted/20 border border-border/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-primary text-sm">{link.anchor}</p>
                              <a 
                                href={link.target}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate block"
                              >
                                {link.target}
                              </a>
                            </div>
                            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* References */}
                  {result.references && result.references.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-purple-400" />
                        External References ({result.references.length})
                      </h4>
                      <div className="space-y-2">
                        {result.references.map((ref, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <a 
                                  href={ref.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-purple-400 hover:text-purple-300 text-sm transition-colors"
                                >
                                  {ref.title}
                                </a>
                                {ref.snippet && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {ref.snippet}
                                  </p>
                                )}
                              </div>
                              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* YouTube Video */}
                  {result.youtubeVideo && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Youtube className="w-4 h-4 text-red-500" />
                        Embedded Video
                      </h4>
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                        <p className="font-medium text-sm">{result.youtubeVideo.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Video ID: {result.youtubeVideo.videoId}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* AI Insights Tab */}
            <TabsContent value="suggestions" className="h-full mt-0">
              <ScrollArea className="h-[50vh] px-6">
                <div className="space-y-6 pb-6">
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-warning" />
                      Quick Wins Applied
                    </h4>
                    <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                      <p className="text-sm text-muted-foreground">
                        {result.aiSuggestions?.quickWins || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4 text-info" />
                      Content Gaps Filled
                    </h4>
                    <div className="p-4 rounded-lg bg-info/10 border border-info/30">
                      <p className="text-sm text-muted-foreground">
                        {result.aiSuggestions?.contentGaps || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Key Improvements</h4>
                    <div className="space-y-2">
                      {result.aiSuggestions?.improvements?.map((imp, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/20">
                          <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">{imp}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyContent}
              className="gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy HTML'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(pageUrl, '_blank')}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Live
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {onPublish && (
              <Button
                onClick={onPublish}
                disabled={isPublishing}
                className="gap-2 bg-gradient-to-r from-primary to-info hover:opacity-90"
              >
                <Zap className="w-4 h-4" />
                {isPublishing ? 'Publishing...' : 'Publish to WordPress'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
