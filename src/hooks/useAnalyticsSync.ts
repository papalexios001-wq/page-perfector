import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAnalyticsStore, RecentJob } from '@/stores/analytics-store';

/**
 * Hook to sync analytics data from Supabase in real-time
 * This ensures the Analytics tab shows accurate, live data
 */
export function useAnalyticsSync() {
  const { 
    updateSessionStats, 
    addRecentJob, 
    updateRecentJob,
    recalculateFromPages,
  } = useAnalyticsStore();

  // Fetch all pages and recalculate analytics
  const syncFromDatabase = useCallback(async () => {
    try {
      // Get all pages with scores
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('id, status, score_before, score_after, word_count')
        .order('updated_at', { ascending: false });

      if (pagesError) {
        console.error('[AnalyticsSync] Error fetching pages:', pagesError);
        return;
      }

      // Recalculate stats from pages
      if (pages) {
        recalculateFromPages(pages.map(p => ({
          status: p.status || 'pending',
          scoreBefore: p.score_before as { overall: number } | undefined,
          scoreAfter: p.score_after as { overall: number } | undefined,
        })));

        // Calculate total words generated
        const totalWords = pages.reduce((sum, p) => {
          if (p.status === 'completed' || p.status === 'published') {
            return sum + (p.word_count || 0);
          }
          return sum;
        }, 0);

        updateSessionStats({ totalWordsGenerated: totalWords });
      }

      // Get recent jobs for the jobs list
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          id,
          page_id,
          status,
          current_step,
          progress,
          created_at,
          completed_at,
          result,
          ai_tokens_used,
          ai_cost,
          execution_time_ms,
          error_message,
          pages!jobs_page_id_fkey (
            url,
            title,
            score_before,
            score_after
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (jobsError) {
        console.error('[AnalyticsSync] Error fetching jobs:', jobsError);
        return;
      }

      if (jobs) {
        // Update AI cost and tokens
        const totalTokens = jobs.reduce((sum, j) => sum + (j.ai_tokens_used || 0), 0);
        const totalCost = jobs.reduce((sum, j) => sum + (Number(j.ai_cost) || 0), 0);
        const completedJobs = jobs.filter(j => j.status === 'completed');
        const avgDuration = completedJobs.length > 0
          ? completedJobs.reduce((sum, j) => sum + (j.execution_time_ms || 0), 0) / completedJobs.length
          : 0;

        updateSessionStats({
          totalAiTokens: totalTokens,
          totalAiCostUsd: totalCost,
          averageJobDuration: avgDuration,
        });

        // Build recent jobs list
        const recentJobs: RecentJob[] = jobs.map(job => {
          const page = job.pages as unknown as { url: string; title: string; score_before: { overall: number }; score_after: { overall: number } } | null;
          const scoreBefore = page?.score_before?.overall || 0;
          const scoreAfter = page?.score_after?.overall || undefined;

          return {
            id: job.id,
            timestamp: job.created_at || new Date().toISOString(),
            pageUrl: page?.url || 'Unknown',
            pageTitle: page?.title || 'Unknown',
            scoreBefore,
            scoreAfter,
            status: job.status as 'completed' | 'running' | 'failed',
            improvement: scoreAfter ? scoreAfter - scoreBefore : undefined,
          };
        });

        // Replace the recent jobs in store
        recentJobs.forEach((job, index) => {
          if (index === 0) {
            // For the first one, we need to clear existing and add
            useAnalyticsStore.setState({ recentJobs: [job] });
          } else {
            addRecentJob(job);
          }
        });

        // Actually, let's just set them all at once
        useAnalyticsStore.setState({ recentJobs });
      }
    } catch (err) {
      console.error('[AnalyticsSync] Unexpected error:', err);
    }
  }, [updateSessionStats, recalculateFromPages, addRecentJob]);

  // Initial sync on mount
  useEffect(() => {
    syncFromDatabase();
  }, [syncFromDatabase]);

  // Subscribe to real-time job updates
  useEffect(() => {
    const channel = supabase
      .channel('analytics-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        (payload) => {
          console.log('[AnalyticsSync] Job update:', payload.eventType);
          // Resync when jobs change
          syncFromDatabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pages' },
        (payload) => {
          console.log('[AnalyticsSync] Page update:', payload.eventType);
          // Resync when pages change
          syncFromDatabase();
        }
      )
      .subscribe((status) => {
        console.log('[AnalyticsSync] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncFromDatabase]);

  return { syncFromDatabase };
}
