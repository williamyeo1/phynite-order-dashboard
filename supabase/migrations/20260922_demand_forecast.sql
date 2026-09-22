-- Demand Forecast tables (real Postgres — not dashboard_storage JSON)
-- Run in Supabase SQL Editor if migrations are not applied automatically.

-- daily_sales: one row per streamer + date + product
create table if not exists daily_sales (
  id uuid primary key default gen_random_uuid(),
  streamer_id bigint not null,
  sale_date date not null,
  product_type text not null check (product_type in ('base', 'premium')),
  packs_sold integer not null check (packs_sold >= 0),
  packs_remaining integer not null check (packs_remaining >= 0),
  source_upload_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (streamer_id, sale_date, product_type)
);

create index if not exists daily_sales_sale_date_idx on daily_sales (sale_date);
create index if not exists daily_sales_streamer_id_idx on daily_sales (streamer_id);

-- sales_uploads: audit log
create table if not exists sales_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  dates_covered date[] not null default '{}',
  rows_imported integer not null default 0,
  rows_flagged integer not null default 0,
  rows_held integer not null default 0,
  rows_ignored_product integer not null default 0,
  status text not null default 'success',
  summary jsonb not null default '{}'::jsonb
);

-- Held rows awaiting name resolution (ignore-for-now or unmatched)
create table if not exists sales_upload_held_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid null references sales_uploads(id) on delete set null,
  raw_streamer_name text not null,
  sale_date date not null,
  product_raw text not null,
  product_type text null check (product_type is null or product_type in ('base', 'premium')),
  packs_sold integer not null,
  packs_remaining integer not null,
  reason text not null default 'unmatched_name',
  created_at timestamptz not null default now()
);

create index if not exists sales_upload_held_rows_name_idx
  on sales_upload_held_rows (raw_streamer_name);

-- Name aliases + ignore-forever
create table if not exists streamer_name_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null,
  normalized_name text not null,
  streamer_id bigint null,
  ignore_forever boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

-- Confirmed zero-sale dates (missing file confirmed as nobody sold)
create table if not exists confirmed_zero_dates (
  sale_date date primary key,
  confirmed_at timestamptz not null default now(),
  note text
);

-- Settings (single-row JSON document + defaults seeded in app)
create table if not exists forecast_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists forecast_settings_log (
  id uuid primary key default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  setting_key text not null,
  old_value jsonb,
  new_value jsonb
);

-- Events
create table if not exists forecast_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (
    event_type in ('set_release', 'holiday', 'platform_promotion', 'other')
  ),
  start_date date not null,
  end_date date not null,
  -- adjustments keyed by week_start ISO → { basePct, premiumPct, measuredBasePct, measuredPremiumPct, overrideLocked }
  week_adjustments jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Forecast runs
create table if not exists forecast_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  as_of_date date not null,
  week1_start date not null,
  week2_start date not null,
  week3_start date not null,
  week1_base integer not null default 0,
  week1_premium integer not null default 0,
  week1_orders integer not null default 0,
  week2_base integer not null default 0,
  week2_premium integer not null default 0,
  week2_orders integer not null default 0,
  week3_base integer not null default 0,
  week3_premium integer not null default 0,
  week3_orders integer not null default 0,
  settings_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists forecast_runs_run_at_idx on forecast_runs (run_at desc);
create index if not exists forecast_runs_week1_idx on forecast_runs (week1_start);

create table if not exists forecast_run_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references forecast_runs(id) on delete cascade,
  streamer_id bigint not null,
  brand_name text not null,
  status text not null,
  horizon text not null,
  next_paid_date date null,
  method text null,
  base_qty integer not null default 0,
  premium_qty integer not null default 0,
  on_hand_base integer null,
  on_hand_premium integer null,
  reorder_point_base numeric null,
  reorder_point_premium numeric null,
  selling_speed_base numeric null,
  selling_speed_premium numeric null,
  days_since_last_paid integer null,
  predicted_orders jsonb not null default '[]'::jsonb,
  unique (run_id, streamer_id)
);

create index if not exists forecast_run_lines_run_id_idx on forecast_run_lines (run_id);

create table if not exists forecast_week_grades (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  primary_run_id uuid null references forecast_runs(id) on delete set null,
  secondary_run_id uuid null references forecast_runs(id) on delete set null,
  actual_base integer not null default 0,
  actual_premium integer not null default 0,
  actual_orders integer not null default 0,
  primary_pred_base integer null,
  primary_pred_premium integer null,
  primary_pred_orders integer null,
  secondary_pred_base integer null,
  secondary_pred_premium integer null,
  secondary_pred_orders integer null,
  primary_error_pct numeric null,
  secondary_error_pct numeric null,
  timing_hit_rate numeric null,
  graded_at timestamptz not null default now()
);

-- RLS: open policies matching dashboard_storage (anon key)
alter table daily_sales enable row level security;
alter table sales_uploads enable row level security;
alter table sales_upload_held_rows enable row level security;
alter table streamer_name_aliases enable row level security;
alter table confirmed_zero_dates enable row level security;
alter table forecast_settings enable row level security;
alter table forecast_settings_log enable row level security;
alter table forecast_events enable row level security;
alter table forecast_runs enable row level security;
alter table forecast_run_lines enable row level security;
alter table forecast_week_grades enable row level security;

do $$ begin
  create policy daily_sales_all on daily_sales for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy sales_uploads_all on sales_uploads for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy sales_upload_held_rows_all on sales_upload_held_rows for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy streamer_name_aliases_all on streamer_name_aliases for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy confirmed_zero_dates_all on confirmed_zero_dates for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_settings_all on forecast_settings for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_settings_log_all on forecast_settings_log for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_events_all on forecast_events for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_runs_all on forecast_runs for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_run_lines_all on forecast_run_lines for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy forecast_week_grades_all on forecast_week_grades for all using (true) with check (true);
exception when duplicate_object then null; end $$;

insert into forecast_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
