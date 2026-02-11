/**
 * BucketBreakdown: Detailed breakdown of a single bucket's allocation and spending.
 */
export interface BucketBreakdown {
  bucket: string;
  allocatedPercent: number;
  allocatedCents: number;
  spentCents: number;
  remainingCents: number;
}

/**
 * FortnightDetailDTO: Complete fortnight summary with per-bucket breakdowns.
 * Used for visualization and budget tracking in frontend.
 */
export interface FortnightDetailDTO {
  id: string;
  periodStart: string; // ISO 8601
  periodEnd: string; // ISO 8601
  periodStartLocalDate?: string;
  periodEndLocalDate?: string;
  timezoneAtCreation?: string;
  totalIncomeCents: number;
  totalExpensesCents: number;
  bucketBreakdowns: BucketBreakdown[];
  fireExtinguisherAmountCents: number;
}
