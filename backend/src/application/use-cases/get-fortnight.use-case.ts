import { ValidationError } from '../../domain/exceptions/validation-error.js';
import { Money } from '../../domain/model/money.js';
import { FortnightSnapshot } from '../../domain/model/fortnight-snapshot.entity.js';
import type { BudgetProfileRepository } from '../../domain/repositories/budget-profile.repository.interface.js';
import type { FortnightSnapshotRepository } from '../../domain/repositories/fortnight-snapshot.repository.interface.js';
import type { TransactionRepository } from '../../domain/repositories/transaction.repository.interface.js';
import { TimezoneService } from '../../domain/services/timezone.service.js';
import type { BucketBreakdown, FortnightDetailDTO } from '../dtos/fortnight-detail.dto.js';
import { UseCase } from './base.use-case.js';

/**
 * GetFortnightRequest: Input for retrieving fortnight details. (internal)
 */
interface GetFortnightRequest {
  userId: string;
  fortnightId: string;
}

/**
 * GetFortnightUseCase: Retrieve complete fortnight details with per-bucket breakdowns.
 * Computes allocated amounts, spent amounts, and remaining budget for each bucket.
 * Dynamically loads transactions within the fortnight period to provide current data.
 * Calculates Fire Extinguisher allocation for debt payoff projection.
 *
 * Timezone-aware (v0.2.0+): Converts fortnight boundaries from user's local calendar
 * days to UTC bounds before querying transactions. This ensures transactions recorded
 * around midnight are assigned to the correct fortnight regardless of user timezone.
 *
 * @extends BaseUseCase
 * @example
 * ```typescript
 * const useCase = new GetFortnightUseCase(fortnightRepo, transactionRepo, profileRepo);
 * const result = await useCase.execute({ userId: 'user-1', fortnightId: 'fortnight-1' });
 * console.log(result.fireExtinguisherAmountCents); // Shows fortnightly debt payment
 * ```
 */
export class GetFortnightUseCase extends UseCase<GetFortnightRequest, FortnightDetailDTO> {
  constructor(
    private fortnightSnapshotRepository: FortnightSnapshotRepository,
    private transactionRepository: TransactionRepository,
    private budgetProfileRepository: BudgetProfileRepository,
  ) {
    super();
  }

  async execute(request: GetFortnightRequest): Promise<FortnightDetailDTO> {
    const snapshot = await this.fortnightSnapshotRepository.findById(
      request.userId,
      request.fortnightId,
    );

    if (!snapshot) {
      throw new ValidationError(`Fortnight with ID ${request.fortnightId} not found`);
    }

    // Get user's timezone; fall back to 'UTC' if not set
    const profile = await this.budgetProfileRepository.getProfile(request.userId);
    const timezone = profile?.timezone ?? 'UTC';

    const bounds = this.resolveBounds(snapshot, timezone);
    if (bounds.repairedSnapshot) {
      await this.fortnightSnapshotRepository.updateTimezoneBounds(
        request.userId,
        bounds.repairedSnapshot,
      );
    }

    const { startUtc, endUtcExclusive } = bounds;

    // Query transactions with half-open bounds (>= startUtc, < endUtcExclusive)
    const allTransactions = await this.transactionRepository.getAll(request.userId);
    const periodTransactions = allTransactions.filter((tx) => {
      const txDate = tx.occurredAt;
      return txDate >= startUtc && txDate < endUtcExclusive; // half-open interval
    });

    // Calculate income and expenses from live transaction data
    const totalIncome = periodTransactions
      .filter((tx) => tx.kind === 'income')
      .reduce((sum, tx) => sum.add(tx.amount), new Money(0));

    const totalExpenses = periodTransactions
      .filter((tx) => tx.kind === 'expense')
      .reduce((sum, tx) => sum.add(tx.amount), new Money(0));

    // Compute per-bucket breakdowns
    const bucketBreakdowns: BucketBreakdown[] = snapshot.allocations.map((allocation) => {
      const allocatedCents = Math.round(totalIncome.cents * allocation.percentage);

      // Calculate spent: expenses from this bucket + transfers OUT of this bucket
      const expensesFromBucket = periodTransactions
        .filter((tx) => tx.sourceBucket === allocation.bucket && tx.kind === 'expense')
        .reduce((sum, tx) => sum.add(tx.amount), new Money(0));

      const transfersOut = periodTransactions
        .filter((tx) => tx.sourceBucket === allocation.bucket && tx.kind === 'transfer')
        .reduce((sum, tx) => sum.add(tx.amount), new Money(0));

      // Calculate transfers IN to this bucket (adds to available balance)
      const transfersIn = periodTransactions
        .filter((tx) => tx.destinationBucket === allocation.bucket && tx.kind === 'transfer')
        .reduce((sum, tx) => sum.add(tx.amount), new Money(0));

      // Net spent = expenses + transfers out - transfers in
      const spent = expensesFromBucket.add(transfersOut).subtract(transfersIn);

      const remainingCents = allocatedCents - spent.cents;

      return {
        bucket: allocation.bucket,
        allocatedPercent: allocation.percentage,
        allocatedCents,
        spentCents: spent.cents,
        remainingCents,
      };
    });

    // Calculate Fire Extinguisher monthly amount (for debt payoff)
    const fireExtinguisherAllocation = snapshot.allocations.find(
      (a) => a.bucket === 'Fire Extinguisher',
    );
    const fireExtinguisherAmountCents = fireExtinguisherAllocation
      ? Math.round(totalIncome.cents * fireExtinguisherAllocation.percentage)
      : 0;

    return {
      id: snapshot.id,
      periodStart: bounds.periodStartDisplay,
      periodEnd: bounds.periodEndDisplay,
      periodStartLocalDate: bounds.periodStartLocalDate,
      periodEndLocalDate: bounds.periodEndLocalDate,
      timezoneAtCreation: bounds.timezoneAtCreation,
      totalIncomeCents: totalIncome.cents,
      totalExpensesCents: totalExpenses.cents,
      bucketBreakdowns,
      fireExtinguisherAmountCents,
    };
  }

  private resolveBounds(
    snapshot: FortnightSnapshot,
    timezone: string,
  ): {
    startUtc: Date;
    endUtcExclusive: Date;
    periodStartDisplay: string;
    periodEndDisplay: string;
    periodStartLocalDate: string;
    periodEndLocalDate: string;
    timezoneAtCreation: string;
    repairedSnapshot?: FortnightSnapshot;
  } {
    if (snapshot.periodStartUtc && snapshot.periodEndUtcExclusive) {
      return {
        startUtc: snapshot.periodStartUtc,
        endUtcExclusive: snapshot.periodEndUtcExclusive,
        periodStartDisplay: snapshot.periodStart.toISOString(),
        periodEndDisplay: snapshot.periodEnd.toISOString(),
        periodStartLocalDate:
          snapshot.periodStartLocalDate ?? snapshot.periodStart.toISOString().split('T')[0]!,
        periodEndLocalDate:
          snapshot.periodEndLocalDate ?? snapshot.periodEnd.toISOString().split('T')[0]!,
        timezoneAtCreation: snapshot.timezoneAtCreation ?? timezone,
      };
    }

    const localStart =
      snapshot.periodStartLocalDate ?? snapshot.periodStart.toISOString().split('T')[0]!;
    let localEnd = snapshot.periodEndLocalDate ?? snapshot.periodEnd.toISOString().split('T')[0]!;

    if (!snapshot.periodStartLocalDate || !snapshot.periodEndLocalDate) {
      const endDate = new Date(localEnd);
      endDate.setUTCDate(endDate.getUTCDate() - 1);
      localEnd = endDate.toISOString().split('T')[0]!;
    }

    const { startUtc, endUtcExclusive } = TimezoneService.getFortnightBoundsUtc(
      localStart,
      localEnd,
      timezone,
    );

    const repairedSnapshot = new FortnightSnapshot(
      snapshot.id,
      snapshot.periodStart,
      snapshot.periodEnd,
      snapshot.allocations,
      snapshot.transactions,
      {
        periodStartLocalDate: localStart,
        periodEndLocalDate: localEnd,
        timezoneAtCreation: snapshot.timezoneAtCreation ?? timezone,
        periodStartUtc: startUtc,
        periodEndUtcExclusive: endUtcExclusive,
      },
    );

    return {
      startUtc,
      endUtcExclusive,
      periodStartDisplay: startUtc.toISOString(),
      periodEndDisplay: endUtcExclusive.toISOString(),
      periodStartLocalDate: localStart,
      periodEndLocalDate: localEnd,
      timezoneAtCreation: snapshot.timezoneAtCreation ?? timezone,
      repairedSnapshot,
    };
  }
}
