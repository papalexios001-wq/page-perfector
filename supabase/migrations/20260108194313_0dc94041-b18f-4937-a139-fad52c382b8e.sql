-- Enable Realtime on jobs table for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

-- Ensure jobs table has proper index for realtime queries
CREATE INDEX IF NOT EXISTS idx_jobs_page_id_status ON public.jobs(page_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);