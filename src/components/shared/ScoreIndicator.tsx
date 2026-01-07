import { cn } from '@/lib/utils';

interface ScoreIndicatorProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ScoreIndicator({
  score,
  size = 'md',
  showLabel = false,
  className,
}: ScoreIndicatorProps) {
  const getScoreColor = (score: number) => {
    if (score >= 90) return { text: 'text-primary', bg: 'bg-primary/20', label: 'Excellent' };
    if (score >= 80) return { text: 'text-success', bg: 'bg-success/20', label: 'Good' };
    if (score >= 60) return { text: 'text-yellow-400', bg: 'bg-yellow-400/20', label: 'Average' };
    if (score >= 40) return { text: 'text-warning', bg: 'bg-warning/20', label: 'Low' };
    return { text: 'text-destructive', bg: 'bg-destructive/20', label: 'Critical' };
  };

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  const { text, bg, label } = getScoreColor(score);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'rounded-full font-mono font-bold flex items-center justify-center',
          sizes[size],
          text,
          bg
        )}
      >
        {score}
      </div>
      {showLabel && (
        <span className={cn('text-xs font-medium', text)}>{label}</span>
      )}
    </div>
  );
}

interface ScoreChangeProps {
  before: number;
  after: number;
  className?: string;
}

export function ScoreChange({ before, after, className }: ScoreChangeProps) {
  const improvement = after - before;
  const isPositive = improvement > 0;

  return (
    <div className={cn('flex items-center gap-2 font-mono text-sm', className)}>
      <span className="text-muted-foreground">{before}</span>
      <span className="text-muted-foreground">→</span>
      <span className={isPositive ? 'text-success' : 'text-destructive'}>
        {after}
      </span>
      <span
        className={cn(
          'px-1.5 py-0.5 rounded text-xs font-bold',
          isPositive ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
        )}
      >
        {isPositive ? '+' : ''}{improvement}
      </span>
    </div>
  );
}
