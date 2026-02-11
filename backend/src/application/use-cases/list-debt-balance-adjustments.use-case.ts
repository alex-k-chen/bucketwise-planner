import type { DebtBalanceAdjustmentRepository } from '../../domain/repositories/debt-balance-adjustment.repository.interface.js';
import type { DebtBalanceAdjustmentDTO } from '../dtos/debt-balance-adjustment.dto.js';
import { UseCase } from './base.use-case.js';

type ListDebtBalanceAdjustmentsRequest = {
  userId: string;
  debtId: string;
  limit?: number;
};

export class ListDebtBalanceAdjustmentsUseCase extends UseCase<
  ListDebtBalanceAdjustmentsRequest,
  { adjustments: DebtBalanceAdjustmentDTO[] }
> {
  constructor(private readonly repo: DebtBalanceAdjustmentRepository) {
    super();
  }

  async execute(
    request: ListDebtBalanceAdjustmentsRequest,
  ): Promise<{ adjustments: DebtBalanceAdjustmentDTO[] }> {
    const adjustments = await this.repo.listByDebtId(request.userId, request.debtId, request.limit);
    return {
      adjustments: adjustments.map((item) => ({
        id: item.id,
        debtId: item.debtId,
        kind: item.kind,
        amountCents: item.amountCents,
        occurredOn: item.occurredOn,
        ...(item.note ? { note: item.note } : {}),
      })),
    };
  }
}
