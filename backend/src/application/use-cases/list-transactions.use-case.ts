import { FortnightSnapshot } from '../../domain/model/fortnight-snapshot.entity.js';
import type { Transaction } from '../../domain/model/transaction.entity.js';
import type { BudgetProfileRepository } from '../../domain/repositories/budget-profile.repository.interface.js';
import type { FortnightSnapshotRepository } from '../../domain/repositories/fortnight-snapshot.repository.interface.js';
import type { TransactionRepository } from '../../domain/repositories/transaction.repository.interface.js';
import { TimezoneService } from '../../domain/services/timezone.service.js';
import type { TransactionDTO } from '../dtos/transaction.dto.js';
import { UseCase } from './base.use-case.js';

/**
 * ListTransactionsRequest: Input for querying transactions.
 * At least one filter must be provided.
 */
interface ListTransactionsRequest {
  userId: string;
  bucket?: string;
  fortnightId?: string;
  startDate?: Date;
  endDate?: Date;
  kind?: string;
  limit?: number;
  offset?: number;
}

/**
 * ListTransactionsResponse: Paginated list of transactions.
 */
interface ListTransactionsResponse {
  transactions: TransactionDTO[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * ListTransactionsUseCase: Query transactions by bucket or fortnight.
 * Supports filtering for budget tracking and analysis.
 *
 * @extends BaseUseCase
 * @example
 * ```typescript
 * const useCase = new ListTransactionsUseCase(transactionRepo);
 * const result = await useCase.execute({ bucket: 'Daily Expenses' });
 * console.log(`Found ${result.total} transactions`);
 * ```
 */
export class ListTransactionsUseCase extends UseCase<
  ListTransactionsRequest,
  ListTransactionsResponse
> {
  constructor(
    private transactionRepository: TransactionRepository,
    private fortnightRepository: FortnightSnapshotRepository,
    private profileRepository: BudgetProfileRepository,
  ) {
    super();
  }

  async execute(request: ListTransactionsRequest): Promise<ListTransactionsResponse> {
    let transactions: Transaction[];

    const profile = await this.profileRepository.getProfile(request.userId);
    const timezone = profile?.timezone ?? 'UTC';

    // Priority: date range > fortnight > bucket
    if (request.startDate && request.endDate) {
      const startLocal = this.formatDateOnly(request.startDate);
      const endLocal = this.formatDateOnly(request.endDate);
      const { startUtc, endUtcExclusive } = TimezoneService.getFortnightBoundsUtc(
        startLocal,
        endLocal,
        timezone,
      );
      transactions = await this.transactionRepository.findByDateRange(
        request.userId,
        startUtc,
        endUtcExclusive,
      );
    } else if (request.fortnightId) {
      const snapshot = await this.fortnightRepository.findById(request.userId, request.fortnightId);
      if (snapshot) {
        const bounds = this.resolveBounds(snapshot, timezone);
        if (bounds.repairedSnapshot) {
          await this.fortnightRepository.updateTimezoneBounds(
            request.userId,
            bounds.repairedSnapshot,
          );
        }
        transactions = await this.transactionRepository.findByDateRange(
          request.userId,
          bounds.startUtc,
          bounds.endUtcExclusive,
        );
      } else {
        transactions = [];
      }
    } else if (request.bucket) {
      transactions = await this.transactionRepository.findByBucket(request.userId, request.bucket);
    } else {
      // If no filters, return empty array (findAll not in interface)
      transactions = [];
    }

    // Apply additional filters
    if (request.kind) {
      transactions = transactions.filter((tx) => tx.kind === request.kind);
    }
    if (request.bucket && (request.startDate || request.fortnightId)) {
      // Filter by bucket: match source bucket OR destination bucket
      transactions = transactions.filter(
        (tx) => tx.sourceBucket === request.bucket || tx.destinationBucket === request.bucket,
      );
    }

    // Store total before pagination
    const total = transactions.length;

    // Apply pagination
    const limit = Math.max(1, request.limit ?? 50);
    const offset = Math.max(0, request.offset ?? 0);
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    // Map domain entities to DTOs
    const transactionDTOs: TransactionDTO[] = paginatedTransactions.map((tx: Transaction) => ({
      id: tx.id,
      bucket: tx.sourceBucket,
      sourceBucket: tx.sourceBucket,
      destinationBucket: tx.destinationBucket,
      kind: tx.kind,
      description: tx.description,
      amountCents: tx.amount.cents,
      occurredAt: tx.occurredAt.toISOString(),
      tags: tx.tags,
    }));

    return {
      transactions: transactionDTOs,
      total,
      limit,
      offset,
    };
  }

  private formatDateOnly(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private resolveBounds(
    snapshot: FortnightSnapshot,
    timezone: string,
  ): {
    startUtc: Date;
    endUtcExclusive: Date;
    repairedSnapshot?: FortnightSnapshot;
  } {
    if (snapshot.periodStartUtc && snapshot.periodEndUtcExclusive) {
      return {
        startUtc: snapshot.periodStartUtc,
        endUtcExclusive: snapshot.periodEndUtcExclusive,
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
      repairedSnapshot,
    };
  }
}
