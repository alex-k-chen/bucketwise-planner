import { createPgPool } from '../src/infrastructure/database/pg.js';

async function run(): Promise<void> {
  const pool = createPgPool();

  try {
    await pool.query('BEGIN');

    await pool.query(`
      UPDATE fortnight_snapshots fs
      SET timezone_at_creation = COALESCE(fs.timezone_at_creation, bp.timezone, 'UTC')
      FROM budget_profiles bp
      WHERE fs.user_id = bp.user_id
        AND fs.timezone_at_creation IS NULL;
    `);

    await pool.query(`
      UPDATE fortnight_snapshots
      SET period_start_local_date = COALESCE(
        period_start_local_date,
        (period_start AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))::date
      )
      WHERE period_start_local_date IS NULL;
    `);

    await pool.query(`
      UPDATE fortnight_snapshots
      SET period_end_local_date = COALESCE(
        period_end_local_date,
        ((period_end AT TIME ZONE COALESCE(timezone_at_creation, 'UTC'))::date - INTERVAL '1 day')::date
      )
      WHERE period_end_local_date IS NULL;
    `);

    await pool.query(`
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
    `);

    await pool.query('COMMIT');
    console.log('Backfill completed successfully.');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
