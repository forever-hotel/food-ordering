import { describe, expect, it } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MockMadComplaintAdapter } from './adapters/mock-mad-complaint.adapter.js';
import { RealMadComplaintAdapter } from './adapters/real-mad-complaint.adapter.js';
import { MAD_COMPLAINT_PROVIDER } from './interfaces/mad-complaint-provider.interface.js';
import { MadInternalModule } from './mad-internal.module.js';

describe('MadInternalModule', () => {
  it('provides MockMadComplaintAdapter when MOCK_EXTERNAL_SERVICES is true', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'true',
              NODE_ENV: 'development',
            }),
          ],
        }),
        MadInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(MAD_COMPLAINT_PROVIDER);
    expect(provider).toBeInstanceOf(MockMadComplaintAdapter);
  });

  it('provides RealMadComplaintAdapter when mock flags are false', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MOCK_EXTERNAL_SERVICES: 'false',
              DEMO_MODE: 'false',
              MAD_SERVICE_URL: 'https://mad.internal.foreverhotel.com',
            }),
          ],
        }),
        MadInternalModule,
      ],
    }).compile();

    const provider = moduleRef.get(MAD_COMPLAINT_PROVIDER);
    expect(provider).toBeInstanceOf(RealMadComplaintAdapter);
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
          MadInternalModule,
        ],
      }).compile(),
    ).rejects.toThrow('Security violation');
  });
});
