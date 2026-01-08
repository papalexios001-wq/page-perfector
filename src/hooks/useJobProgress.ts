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
}

export function useJobProgress(options: UseJobProgressOptions = {}) {
  const [activeJob, setActiveJob] = useState<JobProgress | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const watchedPageIdRef = useRef<string | null>(null);

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

  // Subscribe to job updates for a specific page
  const watchJob = useCallback(async (pageId: string) => {
    // Cleanup existing subscription
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    watchedPageIdRef.current = pageId;

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

          // Trigger callbacks
          if (job.status === 'completed') {
            options.onComplete?.(job);
          } else if (job.status === 'failed') {
            options.onError?.(job);
          }
        }
      )
      .subscribe((status) => {
        console.log('[JobProgress] Subscription status:', status);
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
  }, [options.onComplete, options.onError]);

  // Stop watching
  const stopWatching = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
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
    };
  }, []);

  return {
    activeJob,
    isSubscribed,
    currentStepIndex,
    watchJob,
    stopWatching,
    isRunning: activeJob?.status === 'running' || activeJob?.status === 'queued',
    isCompleted: activeJob?.status === 'completed',
    isFailed: activeJob?.status === 'failed',
  };
}
