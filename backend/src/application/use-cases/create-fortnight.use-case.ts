import { ValidationError } from '../../domain/exceptions/validation-error.js';
import { Allocation } from '../../domain/model/allocation.entity.js';
import type { BarefootBucket } from '../../domain/model/barefoot-bucket.js';
import { FortnightSnapshot } from '../../domain/model/fortnight-snapshot.entity.js';
import type { BudgetProfileRepository } from '../../domain/repositories/budget-profile.repository.interface.js';
import type { FortnightSnapshotRepository } from '../../domain/repositories/fortnight-snapshot.repository.interface.js';
import { TimezoneService } from '../../domain/services/timezone.service.js';
import { UseCase } from './base.use-case.js';

/**
 * CreateFortnightUseCase: create a new fortnight period with initial allocations
 */
interface CreateFortnightInput {
  userId: string;
  periodStartLocalDate: string;
  periodEndLocalDate: string;
  allocations: Array<{
    bucket: BarefootBucket;
    percent: number;
  }>;
}

interface CreateFortnightOutput {
  fortnightId: string;
  success: boolean;
}

export class CreateFortnightUseCase extends UseCase<CreateFortnightInput, CreateFortnightOutput> {
  constructor(
    private fortnightRepository: FortnightSnapshotRepository,
    private budgetProfileRepository: BudgetProfileRepository,
  ) {
    super();
  }

  async execute(input: CreateFortnightInput): Promise<CreateFortnightOutput> {
    // Validate allocations sum to 1.0 (100%)
    const totalPercent = input.allocations.reduce((sum, a) => sum + a.percent, 0);
    if (Math.abs(totalPercent - 1.0) > 0.001) {
      throw new ValidationError(
        `Allocations must sum to 100%, got ${(totalPercent * 100).toFixed(2)}%`,
      );
    }

    const fortnightId = crypto.randomUUID();

    const profile = await this.budgetProfileRepository.getProfile(input.userId);
    const timezone = profile?.timezone ?? 'UTC';
    const { startUtc, endUtcExclusive } = TimezoneService.getFortnightBoundsUtc(
      input.periodStartLocalDate,
      input.periodEndLocalDate,
      timezone,
    );

    // Create allocation entities
    const allocations = input.allocations.map((a) => {
      const id = crypto.randomUUID();
      return new Allocation(id, a.bucket, a.percent);
    });

    // Create and save fortnight snapshot
    const snapshot = new FortnightSnapshot(
      fortnightId,
      startUtc,
      endUtcExclusive,
      allocations,
      [],
      {
        periodStartLocalDate: input.periodStartLocalDate,
        periodEndLocalDate: input.periodEndLocalDate,
        timezoneAtCreation: timezone,
        periodStartUtc: startUtc,
        periodEndUtcExclusive: endUtcExclusive,
      },
    );

    await this.fortnightRepository.add(input.userId, snapshot);

    return {
      fortnightId,
      success: true,
    };
  }
}
