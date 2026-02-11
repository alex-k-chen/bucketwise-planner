import type { DebtBalanceAdjustment } from '../model/debt-balance-adjustment.entity.js';

export interface DebtBalanceAdjustmentRepository {
  recordAndApply(adjustment: DebtBalanceAdjustment, deltaCents: number): Promise<number | null>;
  listByDebtId(userId: string, debtId: string, limit?: number): Promise<DebtBalanceAdjustment[]>;
}
