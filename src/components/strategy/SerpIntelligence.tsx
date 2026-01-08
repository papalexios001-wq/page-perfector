import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Loader2, Globe, MessageCircleQuestion, Link2, 
  TrendingUp, AlertCircle, CheckCircle2, ChevronDown, ChevronUp 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { invokeEdgeFunction, isSupabaseConfigured } from '@/lib/supabase';
import { useConfigStore } from '@/stores/config-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface PeopleAlsoAsk {
  question: string;
  snippet: string;
  link: string;
}

interface SerpResult {
  success: boolean;
  query: string;
  organic: OrganicResult[];
  peopleAlsoAsk: PeopleAlsoAsk[];
  relatedSearches: string[];
  searchParameters: { q: string; gl: string; hl: string };
  cached: boolean;
  error?: string;
}

const COUNTRIES = [
  { value: 'us', label: '🇺🇸 United States' },
  { value: 'uk', label: '🇬🇧 United Kingdom' },
  { value: 'ca', label: '🇨🇦 Canada' },
  { value: 'au', label: '🇦🇺 Australia' },
  { value: 'de', label: '🇩🇪 Germany' },
  { value: 'fr', label: '🇫🇷 France' },
  { value: 'es', label: '🇪🇸 Spain' },
  { value: 'it', label: '🇮🇹 Italy' },
  { value: 'nl', label: '🇳🇱 Netherlands' },
  { value: 'in', label: '🇮🇳 India' },
];

export function SerpIntelligence() {
  const { ai } = useConfigStore();
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('us');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SerpResult | null>(null);
  const [paaOpen, setPaaOpen] = useState(true);
  const [relatedOpen, setRelatedOpen] = useState(false);

  const backendConfigured = isSupabaseConfigured();
  const hasSerperKey = Boolean(ai.serperApiKey);

  const handleAnalyze = async () => {
    if (!query.trim()) {
      toast.error('Please enter a keyword to analyze');
      return;
    }

    if (!hasSerperKey) {
      toast.error('Serper API key required', {
        description: 'Add your Serper API key in Configuration → AI Provider',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    const { data, error } = await invokeEdgeFunction<SerpResult>('serp-analysis', {
      query: query.trim(),
      gl: country,
      hl: 'en',
      serperApiKey: ai.serperApiKey,
    });

    setIsLoading(false);

    if (error) {
      toast.error('SERP analysis failed', { description: error.message });
      return;
    }

    if (data?.success) {
      setResult(data);
      toast.success('SERP analysis complete', {
        description: data.cached ? 'Loaded from cache' : `Found ${data.organic.length} results`,
      });
    } else {
      toast.error('SERP analysis failed', { description: data?.error || 'Unknown error' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleAnalyze();
    }
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          SERP Intelligence
          {result?.cached && (
            <Badge variant="secondary" className="text-xs">Cached</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key Warning */}
        {!hasSerperKey && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-2 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-warning">Add Serper API key in Configuration → AI Provider</p>
          </motion.div>
        )}

        {/* Search Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Enter keyword to analyze..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-muted/50"
            />
          </div>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-[140px] bg-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={isLoading || !backendConfigured || !hasSerperKey}
          className="w-full gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {isLoading ? 'Analyzing SERP...' : 'Analyze SERP'}
        </Button>

        {/* Results */}
        <AnimatePresence mode="wait">
          {result?.success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Top 10 Organic Results */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Top 10 Results
                </div>
                <ScrollArea className="h-[200px] rounded-lg border border-border/50 bg-muted/30">
                  <div className="p-2 space-y-2">
                    {result.organic.map((item) => (
                      <div
                        key={item.position}
                        className="p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                            item.position <= 3 ? 'bg-success/20 text-success' :
                            item.position <= 7 ? 'bg-warning/20 text-warning' :
                            'bg-muted text-muted-foreground'
                          )}>
                            {item.position}
                          </span>
                          <div className="min-w-0 flex-1">
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline line-clamp-1"
                            >
                              {item.title}
                            </a>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {item.snippet}
                            </p>
                            <p className="text-xs text-muted-foreground/70 truncate mt-0.5 flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              {new URL(item.link).hostname}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* People Also Ask */}
              {result.peopleAlsoAsk.length > 0 && (
                <Collapsible open={paaOpen} onOpenChange={setPaaOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageCircleQuestion className="w-4 h-4 text-info" />
                      People Also Ask ({result.peopleAlsoAsk.length})
                    </div>
                    {paaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-1">
                      {result.peopleAlsoAsk.map((paa, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-info/5 border border-info/20 text-sm"
                        >
                          <p className="font-medium text-info">{paa.question}</p>
                          {paa.snippet && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {paa.snippet}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Related Searches */}
              {result.relatedSearches.length > 0 && (
                <Collapsible open={relatedOpen} onOpenChange={setRelatedOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="w-4 h-4 text-success" />
                      Related Searches ({result.relatedSearches.length})
                    </div>
                    {relatedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {result.relatedSearches.map((rs, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="cursor-pointer hover:bg-primary/10"
                          onClick={() => {
                            setQuery(rs);
                          }}
                        >
                          {rs}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
