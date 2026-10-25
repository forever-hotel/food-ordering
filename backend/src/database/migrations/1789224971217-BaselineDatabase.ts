import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineDatabase1789224971217 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
