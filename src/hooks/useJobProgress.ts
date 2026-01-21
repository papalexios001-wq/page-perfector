import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface JobProgress {
  id: string;
  pageId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  errorMessage?: string;
  result?: unknown;
  startedAt?: string;
  completedAt?: string;
}

interface UseJobProgressOptions {
  onComplete?: (job: JobProgress) => void;
  onError?: (job: JobProgress) => void;
  /** How long (ms) without progress update before marking job stalled (default: 120000 = 2 min) */
  stalledThresholdMs?: number;
  /** Enable auto-cleanup of stalled jobs (default: true) */
  autoCleanupStalled?: boolean;
}

// Stalled job cleanup: marks jobs as failed if no updates for threshold
const STALLED_CHECK_INTERVAL = 15000; // Check every 15s
const DEFAULT_STALLED_THRESHOLD = 120000; // 2 minutes without progress = stalled

export function useJobProgress(options: UseJobProgressOptions = {}) {
  const [activeJob, setActiveJob] = useState<JobProgress | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const watchedPageIdRef = useRef<string | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const stalledCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobRef = useRef<JobProgress | null>(null); // Mirror state in ref for interval access
  
  const stalledThreshold = options.stalledThresholdMs ?? DEFAULT_STALLED_THRESHOLD;
  const autoCleanup = options.autoCleanupStalled ?? true;
  
  // Keep ref in sync with state
  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  // Map database step names to UI step indices
  const stepToIndex = useCallback((step: string): number => {
    const stepMap: Record<string, number> = {
      'queued': 0,
      'validating': 0,
      'fetching_content': 1,
      'fetching_wordpress': 1,
      'fetching_neuronwriter': 2,
      'waiting_neuronwriter': 2,
      'analyzing_content': 2,
      'generating_content': 3,
      'processing_response': 3,
      'optimization_complete': 4,
      'saving_results': 4,
      'completed': 4,
      'failed': -1,
    };
    return stepMap[step] ?? 0;
  }, []);

  // Mark a job as failed (stalled cleanup)
  const markJobAsFailed = useCallback(async (jobId: string, pageId: string, reason: string) => {
    console.log('[JobProgress] Marking stalled job as failed:', { jobId, reason });
    
    try {
      await supabase.from('jobs').update({
        status: 'failed',
        current_step: 'stalled_timeout',
        error_message: reason,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      
      await supabase.from('pages').update({ status: 'failed' }).eq('id', pageId);
      
      // Update local state
      setActiveJob(prev => prev ? {
        ...prev,
        status: 'failed',
        currentStep: 'stalled_timeout',
        errorMessage: reason,
      } : null);
      
      // Trigger error callback
      options.onError?.({
        id: jobId,
        pageId,
        status: 'failed',
        currentStep: 'stalled_timeout',
        progress: 0,
        errorMessage: reason,
      });
    } catch (err) {
      console.error('[JobProgress] Failed to mark job as failed:', err);
    }
  }, [options.onError]);

  // Subscribe to job updates for a specific page
  const watchJob = useCallback(async (pageId: string) => {
    // Cleanup existing subscription and stalled checker
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (stalledCheckIntervalRef.current) {
      clearInterval(stalledCheckIntervalRef.current);
      stalledCheckIntervalRef.current = null;
    }

    watchedPageIdRef.current = pageId;
    lastUpdateTimeRef.current = Date.now();

    // First, check for existing running job
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('*')
      .eq('page_id', pageId)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingJob) {
      const job: JobProgress = {
        id: existingJob.id,
        pageId: existingJob.page_id || pageId,
        status: existingJob.status as JobProgress['status'],
        currentStep: existingJob.current_step || 'queued',
        progress: existingJob.progress || 0,
        errorMessage: existingJob.error_message || undefined,
        result: existingJob.result,
        startedAt: existingJob.started_at || undefined,
        completedAt: existingJob.completed_at || undefined,
      };
      setActiveJob(job);
      lastUpdateTimeRef.current = Date.now();
    }
    
    // Start stalled job detection if auto-cleanup enabled
    if (autoCleanup) {
      stalledCheckIntervalRef.current = setInterval(async () => {
        const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
        
        // Read current job from ref (not state setter which causes hook issues)
        const currentJob = activeJobRef.current;
        
        if (
          currentJob &&
          (currentJob.status === 'running' || currentJob.status === 'queued') &&
          timeSinceLastUpdate > stalledThreshold
        ) {
          console.log('[JobProgress] Job stalled detected:', {
            jobId: currentJob.id,
            timeSinceLastUpdate,
            threshold: stalledThreshold,
          });
          
          await markJobAsFailed(
            currentJob.id,
            currentJob.pageId,
            `Job stalled - no progress for ${Math.round(stalledThreshold / 1000)} seconds. The server may have restarted. Please retry.`
          );
          
          // Clear the interval after cleanup
          if (stalledCheckIntervalRef.current) {
            clearInterval(stalledCheckIntervalRef.current);
            stalledCheckIntervalRef.current = null;
          }
        }
      }, STALLED_CHECK_INTERVAL);
    }

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`job-progress-${pageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `page_id=eq.${pageId}`,
        },
        (payload) => {
          console.log('[JobProgress] Realtime update:', payload);
          
          const newData = payload.new as Record<string, unknown>;
          if (!newData) return;

          // Reset stalled timer on any update
          lastUpdateTimeRef.current = Date.now();

          const job: JobProgress = {
            id: newData.id as string,
            pageId: newData.page_id as string || pageId,
            status: newData.status as JobProgress['status'],
            currentStep: (newData.current_step as string) || 'queued',
            progress: (newData.progress as number) || 0,
            errorMessage: (newData.error_message as string) || undefined,
            result: newData.result,
            startedAt: (newData.started_at as string) || undefined,
            completedAt: (newData.completed_at as string) || undefined,
          };

          setActiveJob(job);

          // Trigger callbacks and cleanup stalled checker on terminal states
          if (job.status === 'completed') {
            if (stalledCheckIntervalRef.current) {
              clearInterval(stalledCheckIntervalRef.current);
              stalledCheckIntervalRef.current = null;
            }
            options.onComplete?.(job);
          } else if (job.status === 'failed') {
            if (stalledCheckIntervalRef.current) {
              clearInterval(stalledCheckIntervalRef.current);
              stalledCheckIntervalRef.current = null;
            }
            options.onError?.(job);
          }
        }
      )
      .subscribe((status) => {
        console.log('[JobProgress] Subscription status:', status);
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
  }, [options.onComplete, options.onError, autoCleanup, stalledThreshold, markJobAsFailed]);

  // Stop watching
  const stopWatching = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (stalledCheckIntervalRef.current) {
      clearInterval(stalledCheckIntervalRef.current);
      stalledCheckIntervalRef.current = null;
    }
    watchedPageIdRef.current = null;
    setActiveJob(null);
    setIsSubscribed(false);
  }, []);

  // Get current step index for UI
  const currentStepIndex = activeJob ? stepToIndex(activeJob.currentStep) : 0;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (stalledCheckIntervalRef.current) {
        clearInterval(stalledCheckIntervalRef.current);
      }
    };
  }, []);

  return {
    activeJob,
    isSubscribed,
    currentStepIndex,
    watchJob,
    stopWatching,
    markJobAsFailed,
    isRunning: activeJob?.status === 'running' || activeJob?.status === 'queued',
    isCompleted: activeJob?.status === 'completed',
    isFailed: activeJob?.status === 'failed',
  };
}
