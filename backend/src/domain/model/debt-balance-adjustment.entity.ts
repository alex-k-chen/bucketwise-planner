import { ValidationError } from '../exceptions/validation-error.js';
import { BaseEntity } from './base.entity.js';

export type DebtBalanceAdjustmentKind = 'INTEREST' | 'FEE' | 'CHARGE' | 'CREDIT';

export class DebtBalanceAdjustment extends BaseEntity {
  readonly userId: string;
  readonly debtId: string;
  readonly kind: DebtBalanceAdjustmentKind;
  readonly amountCents: number;
  readonly occurredOn: string;
  readonly note?: string | undefined;

  constructor(
    id: string,
    userId: string,
    debtId: string,
    kind: DebtBalanceAdjustmentKind,
    amountCents: number,
    occurredOn: string,
    note?: string,
  ) {
    super(id);
    this.validateIds(userId, debtId);
    this.validateAmount(amountCents);
    this.validateOccurredOn(occurredOn);

    this.userId = userId;
    this.debtId = debtId;
    this.kind = kind;
    this.amountCents = amountCents;
    this.occurredOn = occurredOn;
    this.note = note?.trim() || undefined;
  }

  private validateIds(userId: string, debtId: string): void {
    if (!userId) throw new ValidationError('User id is required');
    if (!debtId) throw new ValidationError('Debt id is required');
  }

  private validateAmount(amountCents: number): void {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new ValidationError('Amount must be a positive integer in cents');
    }
  }

  private validateOccurredOn(value: string): void {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ValidationError('Occurred on date must be YYYY-MM-DD');
    }
  }
}
