import type { Pool } from 'pg';
import { DebtBalanceAdjustment } from '../../../domain/model/debt-balance-adjustment.entity.js';
import type { DebtBalanceAdjustmentRepository } from '../../../domain/repositories/debt-balance-adjustment.repository.interface.js';

type AdjustmentRow = {
  id: string;
  user_id: string;
  debt_id: string;
  kind: string;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  created_at: Date;
};

export class PostgresDebtBalanceAdjustmentRepository implements DebtBalanceAdjustmentRepository {
  constructor(private pool: Pool) {}

  async recordAndApply(adjustment: DebtBalanceAdjustment, deltaCents: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const insertQuery = `
        INSERT INTO debt_balance_adjustments (
          id, user_id, debt_id, kind, amount_cents, occurred_on, note, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `;
      await client.query(insertQuery, [
        adjustment.id,
        adjustment.userId,
        adjustment.debtId,
        adjustment.kind,
        adjustment.amountCents,
        adjustment.occurredOn,
        adjustment.note ?? null,
      ]);

      const updateQuery = `
        UPDATE debts
        SET current_balance_cents = current_balance_cents + $3,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
          AND (current_balance_cents + $3) >= 0
        RETURNING current_balance_cents
      `;
      const updateResult = await client.query(updateQuery, [
        adjustment.debtId,
        adjustment.userId,
        deltaCents,
      ]);

      if (updateResult.rows.length === 0) {
        throw new Error('Debt not found or balance would go negative');
      }

      await client.query('COMMIT');
      return Number(updateResult.rows[0].current_balance_cents);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listByDebtId(userId: string, debtId: string, limit = 50): Promise<DebtBalanceAdjustment[]> {
    const query = `
      SELECT * FROM debt_balance_adjustments
      WHERE user_id = $1 AND debt_id = $2
      ORDER BY occurred_on DESC, created_at DESC
      LIMIT $3
    `;
    const result = await this.pool.query(query, [userId, debtId, limit]);
    return result.rows.map(
      (row: AdjustmentRow) =>
        new DebtBalanceAdjustment(
          row.id,
          row.user_id,
          row.debt_id,
          row.kind as DebtBalanceAdjustment['kind'],
          row.amount_cents,
          row.occurred_on,
          row.note ?? undefined,
        ),
    );
  }
}
