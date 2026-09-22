# Demand Forecast — database setup

Before using **Demand Forecast**, run the migration in Supabase:

1. Open Supabase → **SQL Editor** → New query
2. Paste the contents of [`supabase/migrations/20260922_demand_forecast.sql`](../supabase/migrations/20260922_demand_forecast.sql)
3. Run it

This creates tables: `daily_sales`, `sales_uploads`, `sales_upload_held_rows`, `streamer_name_aliases`, `confirmed_zero_dates`, `forecast_settings`, `forecast_settings_log`, `forecast_events`, `forecast_runs`, `forecast_run_lines`, `forecast_week_grades`.

CSV format (headers, case-insensitive):

```
Date,Streamer,Product,Cards sold,Cards remaining
```

Product values: `Singles Base` (Base/Black) or `Singles Premium` (Premium/White). Other products are ignored.

Then open **Demand Forecast** in the sidebar → **Upload**.
