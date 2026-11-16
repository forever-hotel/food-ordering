import { describe, expect, it } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MockKmsAdapter } from './adapters/mock-kms.adapter.js';
import { RealKmsAdapter } from './adapters/real-kms.adapter.js';
import { KMS_PROVIDER } from './interfaces/kms-provider.interface.js';
import { KmsInternalModule } from './kms-internal.module.js';

describe('KmsInternalModule', () => {
  it('provides MockKmsAdapter when MOCK_EXTERNAL_SERVICES is true', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({ MOCK_EXTERNAL_SERVICES: 'true', NODE_ENV: 'development' }),
          ],
        }),
        KmsInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(KMS_PROVIDER);
    expect(provider).toBeInstanceOf(MockKmsAdapter);
  });

  it('provides MockKmsAdapter when DEMO_MODE is true', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ DEMO_MODE: 'true', NODE_ENV: 'development' })],
        }),
        KmsInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(KMS_PROVIDER);
    expect(provider).toBeInstanceOf(MockKmsAdapter);
  });

  it('provides RealKmsAdapter when mock flags are disabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'false',
              DEMO_MODE: 'false',
              KMS_SERVICE_URL: 'https://kms.internal.foreverhotel.com',
            }),
          ],
        }),
        KmsInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(KMS_PROVIDER);
    expect(provider).toBeInstanceOf(RealKmsAdapter);
  });

  it('throws an error if mock adapter is enabled in production environment', async () => {
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
          KmsInternalModule,
        ],
      }).compile(),
    ).rejects.toThrow('Security violation');
  });
});
