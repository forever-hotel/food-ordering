import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockKmsAdapter } from './adapters/mock-kms.adapter.js';
import { RealKmsAdapter } from './adapters/real-kms.adapter.js';
import { KMS_PROVIDER } from './interfaces/kms-provider.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KMS_PROVIDER,
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
          return new MockKmsAdapter();
        }

        const baseUrl = configService.get<string>('KMS_SERVICE_URL');
        const apiKey = configService.get<string>('KMS_SERVICE_API_KEY');
        return new RealKmsAdapter(baseUrl, apiKey);
      },
      inject: [ConfigService],
    },
  ],
  exports: [KMS_PROVIDER],
})
export class KmsInternalModule {}
