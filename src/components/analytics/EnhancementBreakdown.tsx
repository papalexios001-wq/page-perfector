import { motion } from 'framer-motion';
import { PieChart, FileEdit, MessageCircle, Link2, FileCode, List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalyticsStore } from '@/stores/analytics-store';
import { cn } from '@/lib/utils';

const iconMap: Record<string, typeof FileEdit> = {
  'Content Expansion': FileEdit,
  'FAQ Sections': MessageCircle,
  'Internal Links': Link2,
  'Schema Markup': FileCode,
  'Table of Contents': List,
};

const colorMap: Record<string, string> = {
  'Content Expansion': 'bg-primary',
  'FAQ Sections': 'bg-info',
  'Internal Links': 'bg-success',
  'Schema Markup': 'bg-warning',
  'Table of Contents': 'bg-purple-400',
};

export function EnhancementBreakdown() {
  const { enhancementBreakdown } = useAnalyticsStore();

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          Enhancement Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {enhancementBreakdown.map((item, i) => {
            const Icon = iconMap[item.type] || FileEdit;
            const barColor = colorMap[item.type] || 'bg-muted-foreground';

            return (
              <motion.div
                key={item.type}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.type}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground font-mono">{item.count}</span>
                    <span className="text-primary font-mono">+{item.avgImpact} pts</span>
                    <span className="text-muted-foreground">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className={cn('h-full rounded-full', barColor)}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
