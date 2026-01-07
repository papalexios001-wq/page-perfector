import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Download, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePagesStore, ActivityLogEntry } from '@/stores/pages-store';
import { ScoreChange } from '@/components/shared/ScoreIndicator';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
};

const colorMap = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
};

const bgMap = {
  info: 'bg-info/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  error: 'bg-destructive/10',
};

export function ActivityLog() {
  const { activityLog } = usePagesStore();

  const formatTime = (timestamp: string) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Activity Log
          </CardTitle>
          <Button variant="ghost" size="sm" className="gap-2 text-xs">
            <Download className="w-3 h-3" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {activityLog.map((entry, index) => {
                const Icon = entry.type === 'info' && entry.message.includes('Step') 
                  ? Loader2 
                  : iconMap[entry.type];
                
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      'p-3 rounded-lg border border-border/50',
                      bgMap[entry.type]
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'p-1.5 rounded-full',
                        bgMap[entry.type]
                      )}>
                        <Icon className={cn(
                          'w-4 h-4',
                          colorMap[entry.type],
                          entry.type === 'info' && entry.message.includes('Step') && 'animate-spin'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-medium truncate text-primary">
                            {entry.pageUrl}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(entry.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {entry.message}
                        </p>
                        {entry.scoreChange && (
                          <div className="mt-2">
                            <ScoreChange
                              before={entry.scoreChange.before}
                              after={entry.scoreChange.after}
                            />
                          </div>
                        )}
                        {entry.type === 'error' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-6 px-2 text-xs text-destructive hover:text-destructive"
                          >
                            Retry Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
