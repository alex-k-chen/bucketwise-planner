import { describe, expect, it } from 'vitest';
import { RecordDebtBalanceAdjustmentUseCase } from '../../../../src/application/use-cases/record-debt-balance-adjustment.use-case.js';
import { Debt } from '../../../../src/domain/model/debt.entity.js';
import { Money } from '../../../../src/domain/model/money.js';
import type { DebtBalanceAdjustmentRepository } from '../../../../src/domain/repositories/debt-balance-adjustment.repository.interface.js';
import type { DebtRepository } from '../../../../src/domain/repositories/debt.repository.interface.js';

describe('RecordDebtBalanceAdjustmentUseCase', () => {
  it('records interest adjustments and increases balance', async () => {
    const debt = new Debt(
      'debt-1',
      'Visa',
      'credit-card',
      new Money(100000),
      new Money(50000),
      0.1999,
      new Money(2000),
      'FORTNIGHTLY',
      1,
    );

    const debtRepo: DebtRepository = {
      add: async () => {},
      update: async () => {},
      delete: async () => {},
      findById: async () => debt,
      getAll: async () => [debt],
      findByPriority: async () => [debt],
      findByType: async () => [debt],
    };

    let appliedDelta = 0;
    const adjustmentRepo: DebtBalanceAdjustmentRepository = {
      recordAndApply: async (_adjustment, deltaCents) => {
        appliedDelta = deltaCents;
        return debt.currentBalance.cents + deltaCents;
      },
      listByDebtId: async () => [],
    };

    const useCase = new RecordDebtBalanceAdjustmentUseCase(debtRepo, adjustmentRepo);
    const result = await useCase.execute({
      userId: 'user-1',
      debtId: 'debt-1',
      kind: 'INTEREST',
      amountCents: 2500,
      occurredOn: '2026-02-12',
    });

    expect(appliedDelta).toBe(2500);
    expect(result.currentBalanceCents).toBe(52500);
  });

  it('records credit adjustments as negative balance changes', async () => {
    const debt = new Debt(
      'debt-2',
      'Mastercard',
      'credit-card',
      new Money(100000),
      new Money(50000),
      0.1999,
      new Money(2000),
      'FORTNIGHTLY',
      1,
    );

    const debtRepo: DebtRepository = {
      add: async () => {},
      update: async () => {},
      delete: async () => {},
      findById: async () => debt,
      getAll: async () => [debt],
      findByPriority: async () => [debt],
      findByType: async () => [debt],
    };

    let appliedDelta = 0;
    const adjustmentRepo: DebtBalanceAdjustmentRepository = {
      recordAndApply: async (_adjustment, deltaCents) => {
        appliedDelta = deltaCents;
        return debt.currentBalance.cents + deltaCents;
      },
      listByDebtId: async () => [],
    };

    const useCase = new RecordDebtBalanceAdjustmentUseCase(debtRepo, adjustmentRepo);
    const result = await useCase.execute({
      userId: 'user-1',
      debtId: 'debt-2',
      kind: 'CREDIT',
      amountCents: 5000,
      occurredOn: '2026-02-12',
    });

    expect(appliedDelta).toBe(-5000);
    expect(result.currentBalanceCents).toBe(45000);
  });
});
