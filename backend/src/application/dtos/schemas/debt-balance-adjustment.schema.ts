import { z } from 'zod';

const adjustmentKindSchema = z.enum(['INTEREST', 'FEE', 'CHARGE', 'CREDIT']);

export const recordDebtBalanceAdjustmentSchema = z.object({
  kind: adjustmentKindSchema,
  amountCents: z.number().int().positive(),
  occurredOn: z.string().optional(),
  note: z.string().max(500).optional(),
});

export type RecordDebtBalanceAdjustmentInput = z.infer<typeof recordDebtBalanceAdjustmentSchema>;
