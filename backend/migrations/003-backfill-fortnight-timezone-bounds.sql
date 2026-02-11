-- Migration: Backfill timezone-aware fortnight bounds
-- Version: 0.4.1
-- Date: 2026-02-11
-- Description: Populate timezone columns for existing fortnight snapshots using user profile timezone.

BEGIN;

-- Ensure timezone_at_creation is set for existing rows
UPDATE fortnight_snapshots fs
SET timezone_at_creation = COALESCE(fs.timezone_at_creation, bp.timezone, 'UTC')
FROM budget_profiles bp
WHERE fs.user_id = bp.user_id
  AND fs.timezone_at_creation IS NULL;

-- Backfill local date columns using stored UTC boundaries
UPDATE fortnight_snapshots
SET period_start_local_date = COALESCE(period_start_local_date, (period_start AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))::date)
WHERE period_start_local_date IS NULL;

-- period_end is stored as UTC exclusive bound; local end date is the previous local day
UPDATE fortnight_snapshots
SET period_end_local_date = COALESCE(
  period_end_local_date,
  ((period_end AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))::date - INTERVAL '1 day')::date
)
WHERE period_end_local_date IS NULL;

-- Backfill explicit UTC bounds from local dates for consistency
UPDATE fortnight_snapshots
SET period_start_utc = COALESCE(
    period_start_utc,
    (period_start_local_date::timestamp AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))
  ),
  period_end_utc_exclusive = COALESCE(
    period_end_utc_exclusive,
    ((period_end_local_date + INTERVAL '1 day')::timestamp AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))
  )
WHERE period_start_local_date IS NOT NULL
  AND period_end_local_date IS NOT NULL;

COMMIT;
