export type DebtBalanceAdjustmentDTO = {
  id: string;
  debtId: string;
  kind: 'INTEREST' | 'FEE' | 'CHARGE' | 'CREDIT';
  amountCents: number;
  occurredOn: string;
  note?: string | undefined;
};
