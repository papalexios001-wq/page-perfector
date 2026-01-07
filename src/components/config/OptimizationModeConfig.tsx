import { motion } from 'framer-motion';
import { Wand2, RefreshCw, Image, FileText, Tag, Folder, Link2, Hash, FileType } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useConfigStore, OptimizationMode } from '@/stores/config-store';
import { cn } from '@/lib/utils';

const modeOptions: {
  id: OptimizationMode;
  title: string;
  description: string;
  bestFor: string;
  icon: typeof Wand2;
}[] = [
  {
    id: 'surgical',
    title: 'Surgical Mode',
    description: 'Enhances existing content while preserving structure, voice, and what works.',
    bestFor: 'Established pages',
    icon: Wand2,
  },
  {
    id: 'full_rewrite',
    title: 'Full Rewrite',
    description: 'Complete regeneration from scratch. Ideal for outdated or low-quality content.',
    bestFor: 'Score < 40',
    icon: RefreshCw,
  },
];

const preservationOptions = [
  { key: 'preserveImages', label: 'Images', icon: Image },
  { key: 'optimizeAltText', label: 'Alt Text', icon: FileText },
  { key: 'preserveFeaturedImage', label: 'Featured Image', icon: FileType },
  { key: 'preserveCategories', label: 'Categories', icon: Folder },
  { key: 'preserveTags', label: 'Tags', icon: Tag },
  { key: 'preserveSlug', label: 'Slug', icon: Link2 },
] as const;

export function OptimizationModeConfig() {
  const { optimization, setOptimization } = useConfigStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wand2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Optimization Mode</CardTitle>
              <CardDescription>
                Choose how content should be optimized
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modeOptions.map((mode) => {
              const Icon = mode.icon;
              const isSelected = optimization.mode === mode.id;
              
              return (
                <button
                  key={mode.id}
                  onClick={() => setOptimization({ mode: mode.id })}
                  className={cn(
                    'relative p-4 rounded-lg border-2 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 bg-muted/30 hover:border-primary/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      isSelected ? 'bg-primary/20' : 'bg-muted/50'
                    )}>
                      <Icon className={cn('w-5 h-5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{mode.title}</h4>
                        {isSelected && (
                          <motion.span
                            layoutId="mode-check"
                            className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-primary-foreground"
                          >
                            ✓
                          </motion.span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                      <p className="text-xs text-primary mt-2">Best for: {mode.bestFor}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Preservation Settings</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {preservationOptions.map((option) => {
                const Icon = option.icon;
                const key = option.key as keyof typeof optimization;
                const isEnabled = optimization[key] as boolean;
                
                return (
                  <div
                    key={option.key}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-all',
                      isEnabled
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/50 bg-muted/30'
                    )}
                  >
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        setOptimization({ [option.key]: checked })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{option.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
