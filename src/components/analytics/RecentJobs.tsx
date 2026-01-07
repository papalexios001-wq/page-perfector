import { motion } from 'framer-motion';
import { History, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAnalyticsStore } from '@/stores/analytics-store';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function RecentJobs() {
  const { recentJobs } = useAnalyticsStore();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-primary';
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Recent Jobs
          </CardTitle>
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            View All
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="w-20">Time</TableHead>
                <TableHead>Page</TableHead>
                <TableHead className="w-20 text-center">Before</TableHead>
                <TableHead className="w-20 text-center">After</TableHead>
                <TableHead className="w-24 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.map((job, i) => (
                <motion.tr
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {formatDistanceToNow(new Date(job.timestamp), { addSuffix: false })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium truncate max-w-[200px]">{job.pageUrl}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {job.pageTitle}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn('font-mono', getScoreColor(job.scoreBefore))}>
                      {job.scoreBefore}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {job.scoreAfter ? (
                      <span className={cn('font-mono', getScoreColor(job.scoreAfter))}>
                        {job.scoreAfter}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      {getStatusIcon(job.status)}
                      {job.improvement && job.improvement > 0 && (
                        <span className="text-xs font-mono text-success bg-success/10 px-1.5 py-0.5 rounded">
                          +{job.improvement}
                        </span>
                      )}
                      {job.status === 'running' && (
                        <span className="text-xs text-muted-foreground">Running</span>
                      )}
                      {job.status === 'failed' && (
                        <span className="text-xs text-destructive">Retry</span>
                      )}
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
