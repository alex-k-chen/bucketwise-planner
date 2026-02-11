import { randomUUID } from 'node:crypto';
import { DebtBalanceAdjustment } from '../../domain/model/debt-balance-adjustment.entity.js';
import type { DebtBalanceAdjustmentRepository } from '../../domain/repositories/debt-balance-adjustment.repository.interface.js';
import type { DebtRepository } from '../../domain/repositories/debt.repository.interface.js';
import { ValidationError } from '../../domain/exceptions/validation-error.js';
import type { RecordDebtBalanceAdjustmentInput } from '../dtos/schemas/debt-balance-adjustment.schema.js';
import { UseCase } from './base.use-case.js';
import { Debt } from '../../domain/model/debt.entity.js';
import { Money } from '../../domain/model/money.js';

type RecordDebtBalanceAdjustmentRequest = RecordDebtBalanceAdjustmentInput & {
  userId: string;
  debtId: string;
};

export class RecordDebtBalanceAdjustmentUseCase extends UseCase<
  RecordDebtBalanceAdjustmentRequest,
  { currentBalanceCents: number }
> {
  constructor(
    private readonly debtRepository: DebtRepository,
    private readonly adjustmentRepository: DebtBalanceAdjustmentRepository,
  ) {
    super();
  }

  async execute(
    request: RecordDebtBalanceAdjustmentRequest,
  ): Promise<{ currentBalanceCents: number }> {
    const debt = await this.debtRepository.findById(request.userId, request.debtId);
    if (!debt) {
      throw new ValidationError('Debt not found');
    }

    const occurredOn = request.occurredOn || new Date().toISOString().split('T')[0]!;
    const adjustment = new DebtBalanceAdjustment(
      randomUUID(),
      request.userId,
      request.debtId,
      request.kind,
      request.amountCents,
      occurredOn,
      request.note,
    );

    const deltaCents = request.kind === 'CREDIT' ? -request.amountCents : request.amountCents;
    const newBalanceCents = debt.currentBalance.cents + deltaCents;

    if (newBalanceCents < 0) {
      throw new ValidationError('Adjustment cannot reduce balance below zero');
    }

    const currentBalanceCents = await this.adjustmentRepository.recordAndApply(
      adjustment,
      deltaCents,
    );

    if (currentBalanceCents === null) {
      const updated = new Debt(
        debt.id,
        debt.name,
        debt.debtType,
        debt.originalAmount,
        debt.currentBalance.add(new Money(deltaCents)),
        debt.interestRate,
        debt.minimumPayment,
        debt.minPaymentFrequency,
        debt.priority,
      );
      await this.debtRepository.update(request.userId, updated);
      return { currentBalanceCents: newBalanceCents };
    }

    return { currentBalanceCents };
  }
}
