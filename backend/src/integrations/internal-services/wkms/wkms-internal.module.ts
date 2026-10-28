import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockWkmsAdapter } from './adapters/mock-wkms.adapter.js';
import { RealWkmsAdapter } from './adapters/real-wkms.adapter.js';
import { WKMS_PROVIDER } from './interfaces/wkms-provider.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WKMS_PROVIDER,
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
          return new MockWkmsAdapter();
        }

        const baseUrl = configService.get<string>('WKMS_SERVICE_URL');
        const apiKey = configService.get<string>('WKMS_SERVICE_API_KEY');
        return new RealWkmsAdapter(baseUrl, apiKey);
      },
      inject: [ConfigService],
    },
  ],
  exports: [WKMS_PROVIDER],
})
export class WkmsInternalModule {}
