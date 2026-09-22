-- Run this in Supabase: SQL Editor → New query → paste → Run

create table if not exists dashboard_storage (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard_storage enable row level security;

drop policy if exists "dashboard_storage_all" on dashboard_storage;
create policy "dashboard_storage_all"
  on dashboard_storage
  for all
  using (true)
  with check (true);

-- Realtime: enable in Supabase Dashboard → Database → Publications
-- or run (if available on your project):
-- alter publication supabase_realtime add table dashboard_storage;
