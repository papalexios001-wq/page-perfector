-- WordPress Sites (tracks connected WP installations)
CREATE TABLE public.wp_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url TEXT NOT NULL,
  username TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  site_name TEXT,
  site_description TEXT,
  capabilities JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pages Queue (stores crawled pages)
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.wp_sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  score_before JSONB,
  score_after JSONB,
  post_id INTEGER,
  post_type TEXT DEFAULT 'post',
  categories TEXT[],
  tags TEXT[],
  featured_image TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimization Jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued',
  current_step TEXT,
  progress INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  ai_tokens_used INTEGER,
  ai_cost DECIMAL(10,4),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.wp_sites(id) ON DELETE SET NULL,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.wp_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Public access policies (for development - will add user auth later)
CREATE POLICY "Allow all operations on wp_sites" ON public.wp_sites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on pages" ON public.pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger for pages
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();