# Daily sales import (Demand Forecast)

## Command

```bash
npm run import:daily-sales -- data/forecast/backfill/sell-rates-daily-90d-2026-09-19.csv --complete
```

Flags:

- `--complete` — mark imported dates as complete days (`is_complete_day = true`)
- `--allow-current-day` — allow rows for the current Pacific calendar date (off by default)

Reference CSV path (also copied into the repo):

- Attachments: Cursor attachments folder for this chat
- Repo copy: `data/forecast/backfill/sell-rates-daily-90d-2026-09-19.csv`

Local store output: `data/forecast/store.json`

After a CLI import on your machine:

1. Open **Demand Forecast** in the dashboard
2. Click **Load local CLI store** (reads `/api/forecast/local-store`)
3. Or use **Import Sales CSV** to upload the same file in the browser (syncs via `dashboard_storage` when Supabase is reachable)

Current Pacific calendar-day rows are skipped unless you pass `--allow-current-day`. For the initial 90-day backfill run on 2026-09-19, rows dated 2026-09-19 were skipped so complete-through is **2026-09-18**.

## Supported CSV headers (exact order)

```
date,creator_id,streamer,product,cards_sold,revenue_usd,cards_remaining,in_stock
```

UTF-8 with BOM is supported.

## Product mappings

| CSV product        | Forecast product |
| ------------------ | ---------------- |
| Singles Base       | black            |
| Singles Premium    | white            |

All other products are ignored (counted, not imported). `revenue_usd` is ignored.

## Complete-day rule

Forecast rates use only rows where `is_complete_day` is true. A `--complete` import marks every accepted date in that file complete through end of day.

Show in UI: **Daily sales complete through: [latest complete date]**

## Current-day protection

Rows for the current Pacific date are rejected unless `--allow-current-day` is passed. Prior-day files should be imported after ~9:30 p.m. Pacific.

## Duplicate / upsert behavior

Unique key: `external_creator_id + sale_date + product_type`

Re-importing the same file updates existing rows; it does not duplicate them.

## Unmatched creators

Matching order:

1. Exact `Streamer.externalCreatorId`
2. Exact `creatorLinks` map
3. Normalized name suggestions only (never auto-accepted if ambiguous)

Link unmatched creators in the Demand Forecast UI (or write `creatorLinks` in storage), then re-import.

## Correcting a prior date

Import a correction CSV covering the date(s) with `--complete`. Upsert overwrites packs_sold / packs_remaining / in_stock for matching keys.

## Verify a successful import

The command prints:

- Date range (min–max)
- Accepted black / white row counts
- Inserted vs updated
- Ignored product rows
- Unmatched creator count
- Rejected rows (including current-day rejects)
- Store path: `data/forecast/store.json`

If Supabase is reachable, the script also attempts to upsert `dashboard_storage` keys (`dailySales`, `dailySalesImports`). Secrets are never printed.
