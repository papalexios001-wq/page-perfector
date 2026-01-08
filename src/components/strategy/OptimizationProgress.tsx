import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, Zap, FileSearch, Brain, Shield, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface OptimizationStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface OptimizationProgressProps {
  isActive: boolean;
  currentStep: number;
  steps: OptimizationStep[];
  pageTitle?: string;
  // REAL progress from server (0-100)
  serverProgress: number;
  // Current step name from server
  serverStepName?: string;
  // Error message if failed
  errorMessage?: string;
  // Called when user wants to cancel/dismiss
  onDismiss?: () => void;
}

const DEFAULT_STEPS: OptimizationStep[] = [
  {
    id: 'validate',
    label: 'Validating Connection',
    description: 'Checking WordPress API access...',
    icon: <Shield className="w-4 h-4" />,
    status: 'pending',
  },
  {
    id: 'fetch',
    label: 'Fetching Content',
    description: 'Retrieving page content from WordPress...',
    icon: <FileSearch className="w-4 h-4" />,
    status: 'pending',
  },
  {
    id: 'analyze',
    label: 'AI Analysis',
    description: 'Analyzing content with AI models...',
    icon: <Brain className="w-4 h-4" />,
    status: 'pending',
  },
  {
    id: 'optimize',
    label: 'Generating Optimizations',
    description: 'Creating SEO-optimized content...',
    icon: <Zap className="w-4 h-4" />,
    status: 'pending',
  },
  {
    id: 'save',
    label: 'Saving Results',
    description: 'Storing optimization in database...',
    icon: <Upload className="w-4 h-4" />,
    status: 'pending',
  },
];

// Map server step names to human-readable descriptions
const STEP_DESCRIPTIONS: Record<string, string> = {
  'queued': 'Waiting in queue...',
  'validating': 'Validating WordPress connection...',
  'fetching_content': 'Fetching page content...',
  'fetching_sitemap_pages': 'Loading sitemap pages for internal linking...',
  'fetching_wordpress': 'Retrieving WordPress data...',
  'fetching_neuronwriter': 'Getting NeuronWriter recommendations...',
  'waiting_neuronwriter': 'Waiting for NeuronWriter analysis...',
  'analyzing_content': 'Analyzing content structure...',
  'generating_content': 'AI is generating optimized content...',
  'processing_response': 'Processing AI response...',
  'validating_content': 'Validating optimized content...',
  'optimization_complete': 'Saving results...',
  'saving_results': 'Saving to database...',
  'completed': 'Optimization complete!',
  'failed': 'Optimization failed',
};

export function OptimizationProgress({ 
  isActive, 
  currentStep, 
  steps = DEFAULT_STEPS,
  pageTitle,
  serverProgress,
  serverStepName,
  errorMessage,
  onDismiss,
}: OptimizationProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number>(Date.now());

  // Detect stalled progress (no update for 60+ seconds)
  const isStalled = serverProgress === lastProgressRef.current && 
    (Date.now() - lastProgressTimeRef.current) > 60000 &&
    serverProgress > 0 && serverProgress < 100;

  // Track progress updates
  useEffect(() => {
    if (serverProgress !== lastProgressRef.current) {
      lastProgressRef.current = serverProgress;
      lastProgressTimeRef.current = Date.now();
    }
  }, [serverProgress]);

  // Timer for elapsed time
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      lastProgressRef.current = 0;
      lastProgressTimeRef.current = Date.now();
      
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Date.now() - startTimeRef.current);
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    } else {
      startTimeRef.current = null;
    }
  }, [isActive]);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  if (!isActive) return null;

  // Use REAL server progress, not fake time-based
  const progress = Math.min(Math.max(serverProgress, 0), 100);
  const activeStep = steps[currentStep] || steps[0];
  const stepDescription = serverStepName ? STEP_DESCRIPTIONS[serverStepName] || serverStepName : activeStep.description;
  const hasFailed = errorMessage || activeStep.status === 'error';

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
          <div className={cn(
            "p-4 border-b border-border",
            hasFailed 
              ? "bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent"
              : "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent"
          )}>
            <div className="flex items-center gap-3">
              <div className="relative">
                {hasFailed ? (
                  <XCircle className="w-6 h-6 text-destructive" />
                ) : (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="text-primary"
                  >
                    <Loader2 className="w-6 h-6" />
                  </motion.div>
                )}
                {!hasFailed && <div className="absolute inset-0 bg-primary/20 rounded-full blur-md" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {hasFailed ? 'Optimization Failed' : 'Optimizing Content'}
                </h3>
                {pageTitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {pageTitle}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-lg font-bold",
                  hasFailed ? "text-destructive" : "text-primary"
                )}>
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar - REAL progress from server */}
          <div className="px-4 pt-4">
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  hasFailed 
                    ? "bg-destructive" 
                    : "bg-gradient-to-r from-primary via-primary to-primary/80"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              {!hasFailed && (
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary/30 rounded-full"
                  animate={{ 
                    width: [`${progress}%`, `${Math.min(progress + 3, 100)}%`],
                    opacity: [0.5, 0]
                  }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{formatTime(elapsedTime)}</span>
              <span>{progress < 100 ? 'Processing...' : 'Complete!'}</span>
            </div>
          </div>

          {/* Current Step - shows REAL step from server */}
          <div className="p-4">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg",
              hasFailed ? "bg-destructive/10" : "bg-muted/50"
            )}>
              <div className={cn(
                "p-2 rounded-lg",
                hasFailed ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
              )}>
                {hasFailed ? (
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
                  {errorMessage || stepDescription}
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
                    index === currentStep ? (hasFailed ? 'bg-destructive' : 'bg-primary/60') :
                    'bg-muted'
                  )}
                  animate={index === currentStep && !hasFailed ? {
                    opacity: [0.6, 1, 0.6],
                  } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
            </p>
          </div>

          {/* Stalled warning */}
          {isStalled && !hasFailed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-4 pb-4"
            >
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">
                  Progress appears stalled. The server may still be processing large content.
                </p>
              </div>
            </motion.div>
          )}

          {/* Error state with dismiss button */}
          {hasFailed && onDismiss && (
            <div className="px-4 pb-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export { DEFAULT_STEPS };
