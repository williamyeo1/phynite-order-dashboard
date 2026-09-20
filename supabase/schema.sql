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

-- ---------------------------------------------------------------------------
-- Demand Forecast tables (see migrations/20260919_daily_sales_forecast.sql)
-- V1 stores the same logical data in dashboard_storage JSON keys:
--   dailySales, dailySalesImports, creatorLinks, demandForecasts,
--   inventoryConfirmations
-- ---------------------------------------------------------------------------

-- create table if not exists daily_streamer_sales (
--   id uuid primary key default gen_random_uuid(),
--   streamer_id bigint null,
--   external_creator_id text not null,
--   streamer_name text,
--   sale_date date not null,
--   product_type text not null check (product_type in ('black', 'white')),
--   packs_sold integer not null check (packs_sold >= 0),
--   packs_remaining integer not null check (packs_remaining >= 0),
--   in_stock boolean not null,
--   source_import_id uuid null,
--   source_file_name text,
--   is_complete_day boolean not null default false,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(),
--   unique (external_creator_id, sale_date, product_type)
-- );

-- create table if not exists daily_sales_imports (
--   id uuid primary key default gen_random_uuid(),
--   file_name text not null,
--   file_hash text,
--   uploaded_by text,
--   uploaded_at timestamptz not null default now(),
--   minimum_sale_date date,
--   maximum_sale_date date,
--   total_source_rows integer not null default 0,
--   accepted_rows integer not null default 0,
--   ignored_product_rows integer not null default 0,
--   inserted_rows integer not null default 0,
--   updated_rows integer not null default 0,
--   unmatched_rows integer not null default 0,
--   rejected_rows integer not null default 0,
--   is_complete_day_import boolean not null default false,
--   status text not null default 'success',
--   error_summary text,
--   raw_summary jsonb
-- );

-- create table if not exists creator_id_links (
--   id uuid primary key default gen_random_uuid(),
--   external_creator_id text not null unique,
--   streamer_id bigint not null,
--   streamer_name text,
--   linked_at timestamptz not null default now(),
--   linked_by text
-- );

-- create table if not exists demand_forecast_runs (
--   id uuid primary key default gen_random_uuid(),
--   created_at timestamptz not null default now(),
--   as_of timestamptz not null,
--   latest_complete_date date not null,
--   target_week_start date not null,
--   target_week_end date not null,
--   forecast_version text not null check (
--     forecast_version in ('monday', 'wednesday', 'friday', 'manual')
--   ),
--   model_version text not null,
--   official_black integer not null default 0,
--   official_white integer not null default 0,
--   official_total integer not null default 0,
--   official_revenue numeric(12, 2) not null default 0,
--   expected_streamer_count integer not null default 0,
--   expected_paid_order_event_count integer not null default 0,
--   watch_count integer not null default 0,
--   data_warning_count integer not null default 0,
--   rows jsonb not null default '[]'::jsonb,
--   review_list jsonb not null default '[]'::jsonb,
--   data_warnings jsonb not null default '[]'::jsonb,
--   adjustments jsonb not null default '[]'::jsonb,
--   original_model_result jsonb,
--   final_adjusted_result jsonb,
--   saved_by text
-- );
