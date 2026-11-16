import { describe, expect, it } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MockWkmsAdapter } from './adapters/mock-wkms.adapter.js';
import { RealWkmsAdapter } from './adapters/real-wkms.adapter.js';
import { WKMS_PROVIDER } from './interfaces/wkms-provider.interface.js';
import { WkmsInternalModule } from './wkms-internal.module.js';

describe('WkmsInternalModule', () => {
  it('provides MockWkmsAdapter when MOCK_EXTERNAL_SERVICES is true', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({ MOCK_EXTERNAL_SERVICES: 'true', NODE_ENV: 'development' }),
          ],
        }),
        WkmsInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(WKMS_PROVIDER);
    expect(provider).toBeInstanceOf(MockWkmsAdapter);
  });

  it('provides RealWkmsAdapter when mock flags are disabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'false',
              DEMO_MODE: 'false',
              WKMS_SERVICE_URL: 'https://wkms.internal.foreverhotel.com',
            }),
          ],
        }),
        WkmsInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(WKMS_PROVIDER);
    expect(provider).toBeInstanceOf(RealWkmsAdapter);
  });

  it('throws in production when mock flag is true', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                MOCK_EXTERNAL_SERVICES: 'true',
                NODE_ENV: 'production',
              }),
            ],
          }),
          WkmsInternalModule,
        ],
      }).compile(),
    ).rejects.toThrow('Security violation');
  });
});
