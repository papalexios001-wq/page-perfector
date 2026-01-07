import { motion } from 'framer-motion';
import { FileText, Target, Zap, TrendingUp, FileEdit } from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import { usePagesStore } from '@/stores/pages-store';
import { useAnalyticsStore } from '@/stores/analytics-store';

export function DashboardMetrics() {
  const { pages } = usePagesStore();
  const { sessionStats } = useAnalyticsStore();
  
  const totalPages = pages.length;
  const atTarget = pages.filter(p => (p.scoreAfter?.overall || p.scoreBefore?.overall || 0) >= 85).length;
  const processing = pages.filter(p => p.status === 'analyzing' || p.status === 'optimizing').length;
  const avgScore = pages.reduce((acc, p) => acc + (p.scoreAfter?.overall || p.scoreBefore?.overall || 0), 0) / totalPages || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          icon={FileText}
          value={totalPages}
          label="Total Pages"
        />
        <MetricCard
          icon={Target}
          value={atTarget}
          label="At Target (85+)"
          variant="success"
        />
        <MetricCard
          icon={Zap}
          value={processing}
          label="Processing"
          variant="primary"
        />
        <MetricCard
          icon={TrendingUp}
          value={`${Math.round(avgScore)}%`}
          label="Avg Score"
        />
        <MetricCard
          icon={FileEdit}
          value={`${(sessionStats.totalWordsGenerated / 1000).toFixed(0)}K`}
          label="Words Generated"
        />
      </div>

      {/* Progress Bar */}
      <div className="glass-panel p-4 border border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progress to Goal</span>
          <span className="text-sm font-mono text-primary">
            {Math.round((atTarget / totalPages) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(atTarget / totalPages) * 100}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-primary to-info rounded-full"
          />
        </div>
      </div>
    </motion.div>
  );
}
