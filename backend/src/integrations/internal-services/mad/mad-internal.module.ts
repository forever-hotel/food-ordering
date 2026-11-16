import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockMadComplaintAdapter } from './adapters/mock-mad-complaint.adapter.js';
import { RealMadComplaintAdapter } from './adapters/real-mad-complaint.adapter.js';
import { MAD_COMPLAINT_PROVIDER } from './interfaces/mad-complaint-provider.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAD_COMPLAINT_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const mockExternal =
          configService.get<string>('MOCK_EXTERNAL_SERVICES') === 'true';
        const demoMode = configService.get<string>('DEMO_MODE') === 'true';
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (mockExternal || demoMode) {
          if (isProduction) {
            throw new Error(
              'Security violation: MOCK_EXTERNAL_SERVICES or DEMO_MODE cannot be active in production.',
            );
          }
          return new MockMadComplaintAdapter();
        }

        const baseUrl = configService.get<string>('MAD_SERVICE_URL');
        const apiKey = configService.get<string>('MAD_SERVICE_API_KEY');
        return new RealMadComplaintAdapter(baseUrl, apiKey);
      },
      inject: [ConfigService],
    },
  ],
  exports: [MAD_COMPLAINT_PROVIDER],
})
export class MadInternalModule {}
