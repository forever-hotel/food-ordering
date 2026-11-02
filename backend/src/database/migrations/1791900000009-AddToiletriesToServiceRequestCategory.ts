import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive PostgreSQL enum migration for service_request_category.
 *
 * Adds 'TOILETRIES' to the service_request_category enum to support the approved
 * 6-category guest service request catalog per DDP-131 and Issue #101.
 *
 * Preserves 'WATER_BOTTLES' in the enum for historical stay query compatibility.
 * Configured with transaction = false to ensure safe ALTER TYPE execution across PostgreSQL/Neon environments.
 */
export class AddToiletriesToServiceRequestCategory1791900000009
  implements MigrationInterface
{
  name = 'AddToiletriesToServiceRequestCategory1791900000009';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE service_request_category ADD VALUE IF NOT EXISTS 'TOILETRIES';
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing values from an existing enum type (ALTER TYPE ... DROP VALUE).
    // In accordance with Section 4 restrictions, no destructive table rebuilding or data deletion is performed.
  }
}
