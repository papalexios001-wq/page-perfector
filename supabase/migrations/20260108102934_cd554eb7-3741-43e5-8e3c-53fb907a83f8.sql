-- SERP cache for Serper-powered SERP intelligence
create table if not exists public.serp_cache (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  gl text not null default 'us',
  hl text not null default 'en',
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- One cached row per query+locale
create unique index if not exists serp_cache_query_gl_hl_key
  on public.serp_cache (query, gl, hl);

create index if not exists serp_cache_expires_at_idx
  on public.serp_cache (expires_at);

alter table public.serp_cache enable row level security;

-- No RLS policies on purpose: cache is accessed only via Edge Functions (service role).
