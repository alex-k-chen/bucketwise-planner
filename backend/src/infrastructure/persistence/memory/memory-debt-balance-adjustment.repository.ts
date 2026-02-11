import { DebtBalanceAdjustment } from '../../../domain/model/debt-balance-adjustment.entity.js';
import type { DebtBalanceAdjustmentRepository } from '../../../domain/repositories/debt-balance-adjustment.repository.interface.js';

export class MemoryDebtBalanceAdjustmentRepository implements DebtBalanceAdjustmentRepository {
  private items: DebtBalanceAdjustment[] = [];

  async recordAndApply(
    adjustment: DebtBalanceAdjustment,
    _deltaCents: number,
  ): Promise<number | null> {
    this.items.push(adjustment);
    return null;
  }

  async listByDebtId(userId: string, debtId: string, limit = 50): Promise<DebtBalanceAdjustment[]> {
    return this.items
      .filter((item) => item.userId === userId && item.debtId === debtId)
      .sort((a, b) => {
        if (a.occurredOn !== b.occurredOn) {
          return a.occurredOn < b.occurredOn ? 1 : -1;
        }
        return a.id < b.id ? 1 : -1;
      })
      .slice(0, limit);
  }
}
