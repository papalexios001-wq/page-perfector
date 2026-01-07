import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}

export function MetricCard({
  icon: Icon,
  value,
  label,
  trend,
  className,
  variant = 'default',
}: MetricCardProps) {
  const variants = {
    default: 'border-border/50',
    primary: 'border-primary/30 glow-primary',
    success: 'border-success/30 glow-success',
    warning: 'border-warning/30',
    destructive: 'border-destructive/30',
  };

  const iconVariants = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-panel p-4 border',
        variants[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('p-2 rounded-lg bg-muted/50', iconVariants[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium font-mono px-2 py-0.5 rounded-full',
              trend.isPositive
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}
