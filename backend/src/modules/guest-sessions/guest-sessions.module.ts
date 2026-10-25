import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FossSession } from './entities/foss-session.entity.js';
import { BOOKING_PROVIDER } from './interfaces/booking-verification.interface.js';
import { MockBookingProvider } from './providers/mock-booking.provider.js';
import { FossSessionRepository } from './repositories/foss-session.repository.js';
import { BookingVerificationService } from './services/booking-verification.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FossSession])],
  providers: [
    FossSessionRepository,
    BookingVerificationService,
    {
      provide: BOOKING_PROVIDER,
      useFactory: (): MockBookingProvider => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'Mock Booking provider is disabled in production. ' +
              'Configure the approved Booking service adapter.',
          );
        }

        return new MockBookingProvider();
      },
    },
  ],
  exports: [FossSessionRepository, BookingVerificationService],
})
export class GuestSessionsModule {}
