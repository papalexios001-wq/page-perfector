import { motion } from 'framer-motion';
import { Settings, Target, FileText, MessageCircle, Link2, List, Lightbulb, MousePointer2, Timer, Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfigStore } from '@/stores/config-store';
import { cn } from '@/lib/utils';

const enhancementOptions = [
  { key: 'enableFaqs', label: 'FAQs', icon: MessageCircle },
  { key: 'enableSchema', label: 'Schema', icon: FileText },
  { key: 'enableInternalLinks', label: 'Int. Links', icon: Link2 },
  { key: 'enableToc', label: 'ToC', icon: List },
  { key: 'enableKeyTakeaways', label: 'Key Takeaways', icon: Lightbulb },
  { key: 'enableCtas', label: 'CTAs', icon: MousePointer2 },
] as const;

export function AdvancedSettings() {
  const { advanced, setAdvanced } = useConfigStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Advanced Settings</CardTitle>
              <CardDescription>
                Fine-tune optimization parameters and enhancements
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quality Thresholds */}
          <div className="space-y-4">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              Quality Thresholds
            </Label>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Target Score</span>
                  <span className="text-sm font-mono font-medium text-primary">{advanced.targetScore}+</span>
                </div>
                <Slider
                  value={[advanced.targetScore]}
                  onValueChange={([value]) => setAdvanced({ targetScore: value })}
                  min={50}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Min Word Count</Label>
                  <Select
                    value={advanced.minWordCount.toString()}
                    onValueChange={(value) => setAdvanced({ minWordCount: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[500, 1000, 1500, 2000, 2500].map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count.toLocaleString()} words
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Max Word Count</Label>
                  <Select
                    value={advanced.maxWordCount.toString()}
                    onValueChange={(value) => setAdvanced({ maxWordCount: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2000, 3000, 4000, 5000, 6000].map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count.toLocaleString()} words
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Content Enhancements */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Content Enhancements</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {enhancementOptions.map((option) => {
                const Icon = option.icon;
                const key = option.key as keyof typeof advanced;
                const isEnabled = advanced[key] as boolean;
                
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
                        setAdvanced({ [option.key]: checked })
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

          {/* Rate Limiting */}
          <div className="space-y-4">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              Rate Limiting
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Gauge className="w-3 h-3" />
                  Concurrent Jobs
                </Label>
                <Select
                  value={advanced.concurrentJobs.toString()}
                  onValueChange={(value) => setAdvanced({ concurrentJobs: parseInt(value) })}
                >
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10].map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} job{count > 1 ? 's' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Timer className="w-3 h-3" />
                  Delay Between Jobs
                </Label>
                <Select
                  value={advanced.delayBetweenJobs.toString()}
                  onValueChange={(value) => setAdvanced({ delayBetweenJobs: parseInt(value) })}
                >
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1000, 2000, 3000, 5000].map((ms) => (
                      <SelectItem key={ms} value={ms.toString()}>
                        {ms === 0 ? 'No delay' : `${ms / 1000}s`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
