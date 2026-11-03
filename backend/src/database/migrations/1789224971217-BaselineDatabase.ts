import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Historical baseline database migration.
 *
 * Marks the starting point of the FOSS TypeORM migration sequence.
 * Primary database identity protection is enforced at the DataSource runner level
 * (via assertApprovedDatabaseIdentity in data-source.ts) on every migration run,
 * ensuring safety does not rely on whether this baseline migration is pending or complete.
 */
export class BaselineDatabase1789224971217 implements MigrationInterface {
  name = 'BaselineDatabase1789224971217';

  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
