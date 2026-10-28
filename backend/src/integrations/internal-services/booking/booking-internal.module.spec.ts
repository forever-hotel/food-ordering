import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MockBookingAdapter } from './adapters/mock-booking.adapter.js';
import { RealBookingAdapter } from './adapters/real-booking.adapter.js';
import { BookingInternalModule } from './booking-internal.module.js';
import { BOOKING_PROVIDER } from './interfaces/booking-provider.interface.js';

describe('BookingInternalModule provider selection', () => {
  it('provides MockBookingAdapter when MOCK_EXTERNAL_SERVICES is true in development', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [BookingInternalModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'MOCK_EXTERNAL_SERVICES') return 'true';
          if (key === 'NODE_ENV') return 'development';
          return undefined;
        },
      })
      .compile();

    const provider = moduleRef.get(BOOKING_PROVIDER);
    expect(provider).toBeInstanceOf(MockBookingAdapter);
  });

  it('provides MockBookingAdapter when DEMO_MODE is true in development', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [BookingInternalModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'DEMO_MODE') return 'true';
          if (key === 'NODE_ENV') return 'development';
          return undefined;
        },
      })
      .compile();

    const provider = moduleRef.get(BOOKING_PROVIDER);
    expect(provider).toBeInstanceOf(MockBookingAdapter);
  });

  it('throws security error if mock mode is attempted in production', async () => {
    await expect(
      Test.createTestingModule({
        imports: [BookingInternalModule],
      })
        .overrideProvider(ConfigService)
        .useValue({
          get: (key: string) => {
            if (key === 'MOCK_EXTERNAL_SERVICES') return 'true';
            if (key === 'NODE_ENV') return 'production';
            return undefined;
          },
        })
        .compile(),
    ).rejects.toThrow(/Security violation/);
  });

  it('provides RealBookingAdapter when mock mode is disabled', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [BookingInternalModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'MOCK_EXTERNAL_SERVICES') return 'false';
          if (key === 'DEMO_MODE') return 'false';
          if (key === 'FDS_BOOKING_SERVICE_URL')
            return 'https://fds.example.com';
          return undefined;
        },
      })
      .compile();

    const provider = moduleRef.get(BOOKING_PROVIDER);
    expect(provider).toBeInstanceOf(RealBookingAdapter);
  });
});
