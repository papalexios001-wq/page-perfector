import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalyticsStore } from '@/stores/analytics-store';
import { cn } from '@/lib/utils';

export function ScoreDistribution() {
  const { scoreDistribution } = useAnalyticsStore();

  const maxCount = Math.max(
    ...scoreDistribution.map((d) => Math.max(d.countBefore, d.countAfter))
  );

  const getBarColor = (bucket: string, type: 'before' | 'after') => {
    if (type === 'before') return 'bg-muted-foreground/30';
    
    if (bucket === '90-100') return 'bg-primary';
    if (bucket === '80-89') return 'bg-success';
    if (bucket === '70-79') return 'bg-yellow-400';
    if (bucket === '60-69') return 'bg-warning';
    return 'bg-destructive';
  };

  // Calculate means
  const calculateMean = (type: 'before' | 'after') => {
    let total = 0;
    let count = 0;
    
    scoreDistribution.forEach((d) => {
      const bucketMid = d.bucket === '<40' ? 30 : 
        parseInt(d.bucket.split('-')[0]) + 5;
      const c = type === 'before' ? d.countBefore : d.countAfter;
      total += bucketMid * c;
      count += c;
    });
    
    return count > 0 ? (total / count).toFixed(1) : '0';
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            Score Distribution
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-muted-foreground/30" />
              <span className="text-muted-foreground">Before</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary" />
              <span className="text-muted-foreground">After</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          {/* Before Chart */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-4">Before Optimization</p>
            {scoreDistribution.map((d, i) => (
              <motion.div
                key={`before-${d.bucket}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className="w-14 text-xs text-muted-foreground font-mono">{d.bucket}</span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.countBefore / maxCount) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className={cn('h-full rounded', getBarColor(d.bucket, 'before'))}
                  />
                </div>
                <span className="w-6 text-xs text-muted-foreground font-mono text-right">
                  {d.countBefore}
                </span>
              </motion.div>
            ))}
          </div>

          {/* After Chart */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-4">After Optimization</p>
            {scoreDistribution.map((d, i) => (
              <motion.div
                key={`after-${d.bucket}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className="w-14 text-xs text-muted-foreground font-mono">{d.bucket}</span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.countAfter / maxCount) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 + 0.3 }}
                    className={cn('h-full rounded', getBarColor(d.bucket, 'after'))}
                  />
                </div>
                <span className="w-6 text-xs text-muted-foreground font-mono text-right">
                  {d.countAfter}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Mean:</span>
            <span className="font-mono text-muted-foreground">{calculateMean('before')}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono text-primary">{calculateMean('after')}</span>
            <span className="text-success font-medium">
              (+{(parseFloat(calculateMean('after')) - parseFloat(calculateMean('before'))).toFixed(1)})
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
