import { FortnightSnapshot } from '../../domain/model/fortnight-snapshot.entity.js';
import type { BudgetProfileRepository } from '../../domain/repositories/budget-profile.repository.interface.js';
import type { FortnightSnapshotRepository } from '../../domain/repositories/fortnight-snapshot.repository.interface.js';
import type { TransactionRepository } from '../../domain/repositories/transaction.repository.interface.js';
import { TimezoneService } from '../../domain/services/timezone.service.js';
import { UseCase } from './base.use-case.js';

export interface ForthnightSummaryDTO {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodStartLocalDate?: string;
  periodEndLocalDate?: string;
  timezoneAtCreation?: string;
  totalIncomeCents: number;
  totalExpensesCents: number;
}

export interface ListForthnightsRequest {
  userId: string;
}

export class ListForthnightsUseCase extends UseCase<
  ListForthnightsRequest,
  ForthnightSummaryDTO[]
> {
  constructor(
    private readonly snapshotRepo: FortnightSnapshotRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly profileRepo: BudgetProfileRepository,
  ) {
    super();
  }

  async execute(request: ListForthnightsRequest): Promise<ForthnightSummaryDTO[]> {
    const fortnights = await this.snapshotRepo.getAll(request.userId);

    // Sort by period start descending (newest first)
    fortnights.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    // Calculate totals from actual transactions for each fortnight
    const summaries = await Promise.all(
      fortnights.map((snapshot) => this.mapSnapshotWithTransactions(request.userId, snapshot)),
    );

    return summaries;
  }

  private async mapSnapshotWithTransactions(
    userId: string,
    snapshot: FortnightSnapshot,
  ): Promise<ForthnightSummaryDTO> {
    const profile = await this.profileRepo.getProfile(userId);
    const timezone = profile?.timezone ?? 'UTC';
    const bounds = this.resolveBounds(snapshot, timezone);

    if (bounds.repairedSnapshot) {
      await this.snapshotRepo.updateTimezoneBounds(userId, bounds.repairedSnapshot);
    }

    // Query actual transactions within this fortnight's period
    const transactions = await this.transactionRepo.findByDateRange(
      userId,
      bounds.startUtc,
      bounds.endUtcExclusive,
    );

    // Calculate totals from actual transactions
    const totalIncomeCents = transactions
      .filter((tx) => tx.kind === 'income')
      .reduce((sum, tx) => sum + tx.amount.cents, 0);

    const totalExpensesCents = transactions
      .filter((tx) => tx.kind === 'expense')
      .reduce((sum, tx) => sum + tx.amount.cents, 0);

    return {
      id: snapshot.id,
      periodStart: bounds.periodStartDisplay,
      periodEnd: bounds.periodEndDisplay,
      periodStartLocalDate: bounds.periodStartLocalDate,
      periodEndLocalDate: bounds.periodEndLocalDate,
      timezoneAtCreation: bounds.timezoneAtCreation,
      totalIncomeCents,
      totalExpensesCents,
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
