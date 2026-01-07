import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Clock, Loader2, XCircle, SkipForward } from 'lucide-react';
import { PageStatus } from '@/stores/pages-store';

interface StatusBadgeProps {
  status: PageStatus;
  className?: string;
}

const statusConfig: Record<
  PageStatus,
  { icon: typeof Circle; label: string; className: string }
> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'text-muted-foreground bg-muted',
  },
  analyzing: {
    icon: Loader2,
    label: 'Analyzing',
    className: 'text-info bg-info/20',
  },
  optimizing: {
    icon: Loader2,
    label: 'Optimizing',
    className: 'text-primary bg-primary/20',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'text-success bg-success/20',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'text-destructive bg-destructive/20',
  },
  skipped: {
    icon: SkipForward,
    label: 'Skipped',
    className: 'text-muted-foreground bg-muted',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimated = status === 'analyzing' || status === 'optimizing';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      <Icon className={cn('w-3 h-3', isAnimated && 'animate-spin')} />
      {config.label}
    </div>
  );
}
