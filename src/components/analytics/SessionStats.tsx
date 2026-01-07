import { motion } from 'framer-motion';
import { BarChart3, Clock, Zap, TrendingUp, FileEdit, CheckCircle2, XCircle, Target, DollarSign } from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import { useAnalyticsStore } from '@/stores/analytics-store';

export function SessionStats() {
  const { sessionStats } = useAnalyticsStore();

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getSessionDuration = () => {
    const start = new Date(sessionStats.startedAt);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    return formatDuration(diff);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Session Overview
        </h2>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-mono">{getSessionDuration()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Zap}
          value={sessionStats.pagesProcessed}
          label="Pages Processed"
          variant="primary"
        />
        <MetricCard
          icon={TrendingUp}
          value={`+${sessionStats.averageScoreImprovement.toFixed(1)}`}
          label="Avg Score Improvement"
          variant="success"
        />
        <MetricCard
          icon={FileEdit}
          value={`${(sessionStats.totalWordsGenerated / 1000).toFixed(0)}K`}
          label="Words Generated"
        />
        <MetricCard
          icon={DollarSign}
          value={`$${sessionStats.totalAiCostUsd.toFixed(2)}`}
          label="AI Cost"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={CheckCircle2}
          value={`${(sessionStats.successRate * 100).toFixed(1)}%`}
          label="Success Rate"
          variant="success"
        />
        <MetricCard
          icon={XCircle}
          value={sessionStats.pagesFailed}
          label="Failed (retry)"
          variant={sessionStats.pagesFailed > 0 ? 'destructive' : 'default'}
        />
        <MetricCard
          icon={Clock}
          value={formatDuration(sessionStats.averageJobDuration)}
          label="Avg Time Per Page"
        />
        <MetricCard
          icon={Target}
          value={`${Math.round((sessionStats.pagesAtTarget / sessionStats.pagesProcessed) * 100) || 0}%`}
          label="At Target (85+)"
          variant="primary"
        />
      </div>
    </motion.div>
  );
}
