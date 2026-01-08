import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, Zap, FileSearch, Brain, Shield, Upload } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface OptimizationStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed' | 'error';
  duration?: number; // Expected duration in ms
}

interface OptimizationProgressProps {
  isActive: boolean;
  currentStep: number;
  steps: OptimizationStep[];
  pageTitle?: string;
  // No more client-side timeout - progress is real-time from server
}

const DEFAULT_STEPS: OptimizationStep[] = [
  {
    id: 'validate',
    label: 'Validating Connection',
    description: 'Checking WordPress API access...',
    icon: <Shield className="w-4 h-4" />,
    status: 'pending',
    duration: 2000,
  },
  {
    id: 'fetch',
    label: 'Fetching Content',
    description: 'Retrieving page content from WordPress...',
    icon: <FileSearch className="w-4 h-4" />,
    status: 'pending',
    duration: 5000,
  },
  {
    id: 'analyze',
    label: 'AI Analysis',
    description: 'Analyzing content with AI models...',
    icon: <Brain className="w-4 h-4" />,
    status: 'pending',
    duration: 30000,
  },
  {
    id: 'optimize',
    label: 'Generating Optimizations',
    description: 'Creating SEO-optimized content...',
    icon: <Zap className="w-4 h-4" />,
    status: 'pending',
    duration: 10000,
  },
  {
    id: 'save',
    label: 'Saving Results',
    description: 'Storing optimization in database...',
    icon: <Upload className="w-4 h-4" />,
    status: 'pending',
    duration: 2000,
  },
];

export function OptimizationProgress({ 
  isActive, 
  currentStep, 
  steps = DEFAULT_STEPS,
  pageTitle,
}: OptimizationProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Calculate total estimated duration
  useEffect(() => {
    const total = steps.reduce((sum, step) => sum + (step.duration || 5000), 0);
    setEstimatedTotal(total);
  }, [steps]);

  // Timer for elapsed time (no timeout - progress is real-time from server)
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Date.now() - startTimeRef.current);
        }
      }, 100);

      return () => {
        clearInterval(interval);
      };
    } else {
      startTimeRef.current = null;
    }
  }, [isActive]);

  // Calculate progress based on step and elapsed time
  const calculateProgress = (): number => {
    if (!isActive || currentStep < 0) return 0;
    
    let completedDuration = 0;
    for (let i = 0; i < currentStep && i < steps.length; i++) {
      completedDuration += steps[i].duration || 5000;
    }
    
    const currentStepDuration = steps[currentStep]?.duration || 5000;
    const stepProgress = Math.min(elapsedTime / currentStepDuration, 0.95);
    
    const totalProgress = (completedDuration + (currentStepDuration * stepProgress)) / estimatedTotal;
    return Math.min(totalProgress * 100, 95); // Never show 100% until actually complete
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getEstimatedRemaining = (): string => {
    const progress = calculateProgress();
    if (progress <= 0) return 'Calculating...';
    
    const estimatedTotalTime = (elapsedTime / progress) * 100;
    const remaining = Math.max(0, estimatedTotalTime - elapsedTime);
    
    if (remaining < 1000) return 'Almost done...';
    return `~${formatTime(remaining)} remaining`;
  };

  if (!isActive) return null;

  const progress = calculateProgress();
  const activeStep = steps[currentStep] || steps[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed bottom-6 right-6 z-50 w-96"
      >
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="text-primary"
                >
                  <Loader2 className="w-6 h-6" />
                </motion.div>
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-md" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  Optimizing Content
                </h3>
                {pageTitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {pageTitle}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-primary">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="px-4 pt-4">
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-primary/80 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary/30 rounded-full"
                animate={{ 
                  width: [`${progress}%`, `${Math.min(progress + 5, 100)}%`],
                  opacity: [0.5, 0]
                }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{formatTime(elapsedTime)}</span>
              <span>{getEstimatedRemaining()}</span>
            </div>
          </div>

          {/* Current Step */}
          <div className="p-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className={cn(
                "p-2 rounded-lg",
                activeStep.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
              )}>
                {activeStep.status === 'error' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  activeStep.icon
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">
                  {activeStep.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activeStep.description}
                </p>
              </div>
              {activeStep.status === 'completed' && (
                <Check className="w-5 h-5 text-green-500" />
              )}
            </div>
          </div>

          {/* Step Indicators */}
          <div className="px-4 pb-4">
            <div className="flex gap-1">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  className={cn(
                    "flex-1 h-1 rounded-full transition-colors duration-300",
                    index < currentStep ? 'bg-primary' :
                    index === currentStep ? 'bg-primary/60' :
                    'bg-muted'
                  )}
                  animate={index === currentStep ? {
                    opacity: [0.6, 1, 0.6],
                  } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Step {currentStep + 1} of {steps.length}
            </p>
          </div>

          {/* Long-running indicator (informational, no timeout) */}
          {elapsedTime > 120000 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-4 pb-4"
            >
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-600 dark:text-blue-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">
                  Complex optimization in progress. This may take a few minutes for large content.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export { DEFAULT_STEPS };
