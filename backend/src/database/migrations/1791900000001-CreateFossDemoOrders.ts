import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates demonstration food order persistence tables (foss_demo_orders and foss_demo_order_items).
 *
 * In accordance with AGENTS.md §3 and DDP-129, KMS is the authoritative domain owner
 * of food orders. These tables provide isolated, clearly namespaced demo order projections
 * and idempotency tracking for FOSS without pretending to be the canonical KMS schema.
 */
export class CreateFossDemoOrders1791900000001 implements MigrationInterface {
  name = 'CreateFossDemoOrders1791900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // KMS is the authoritative owner of food orders per ADR-003 and DDP-129.
    // Demo orders are strictly development/demo projections and must not be created
    // in production or shared staging Neon environments.
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.SKIP_DEMO_TABLES === 'true'
    ) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_demo_orders" (
        "order_id" VARCHAR(100) NOT NULL,
        "booking_id" UUID NOT NULL,
        "room_number" VARCHAR(10) NOT NULL,
        "status" VARCHAR(30) NOT NULL DEFAULT 'PLACED',
        "total_amount" NUMERIC(10, 2) NOT NULL,
        "allergy_notes" VARCHAR(300),
        "idempotency_key" VARCHAR(128) NOT NULL,
        "estimated_delivery_minutes" INT NOT NULL DEFAULT 25,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "PK_foss_demo_orders_order_id"
          PRIMARY KEY ("order_id"),

        CONSTRAINT "UQ_foss_demo_orders_idempotency_key"
          UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_demo_orders_booking_room"
        ON "foss_demo_orders" ("booking_id", "room_number")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_demo_order_items" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "order_id" VARCHAR(100) NOT NULL,
        "menu_item_id" VARCHAR(100) NOT NULL,
        "name" VARCHAR(200) NOT NULL,
        "unit_price" NUMERIC(10, 2) NOT NULL,
        "quantity" INT NOT NULL,
        "special_notes" VARCHAR(200),

        CONSTRAINT "PK_foss_demo_order_items_id"
          PRIMARY KEY ("id"),

        CONSTRAINT "FK_foss_demo_order_items_order_id"
          FOREIGN KEY ("order_id")
          REFERENCES "foss_demo_orders"("order_id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_demo_order_items_order_id"
        ON "foss_demo_order_items" ("order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "foss_demo_order_items"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "foss_demo_orders"
    `);
  }
}
