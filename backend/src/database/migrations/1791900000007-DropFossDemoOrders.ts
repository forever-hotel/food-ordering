import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 1791900000007: DropFossDemoOrders
 *
 * Drops demonstration food order persistence tables (foss_demo_order_items and foss_demo_orders).
 *
 * In accordance with Organization ADR-003 (Database Schema and Ownership), KMS (Kitchen Management System)
 * is the sole authoritative owner of food orders (kms_food_orders). FOSS maintains demonstration food order
 * state purely in-memory for local development, demo flows, and automated testing.
 *
 * Safety Preconditions Enforced in up():
 * 1. Checks whether tables exist; skips cleanly if neither table exists (compatible with fresh/shared environments).
 * 2. Verifies both tables contain strictly zero rows. Aborts with Error if any records exist.
 * 3. Verifies no unexpected inbound foreign keys reference foss_demo_orders or foss_demo_order_items from external tables.
 * 4. Verifies no database views depend on foss_demo_orders or foss_demo_order_items.
 * 5. Drops only the known demo-order tables using RESTRICT (never CASCADE).
 * 6. Preserves all FOSS operational tables (foss_sessions, foss_service_requests, foss_complaints, foss_qr_activations)
 *    and never touches KMS-owned tables.
 * 7. Preserves TypeORM migration history without altering historical records.
 *
 * NOTE on down():
 * Recreating empty tables via down() restores schema definitions only.
 * It is NOT a recovery method for previously deleted data.
 */
export class DropFossDemoOrders1791900000007 implements MigrationInterface {
  name = 'DropFossDemoOrders1791900000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Check table existence
    const tables = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('foss_demo_orders', 'foss_demo_order_items');
    `);

    const existingTableNames: string[] = tables.map(
      (t: { table_name: string }) => t.table_name,
    );

    if (existingTableNames.length === 0) {
      // Neither table exists; environment is already clean
      return;
    }

    // 2. Validate zero rows in foss_demo_order_items if present
    if (existingTableNames.includes('foss_demo_order_items')) {
      const [{ count: itemsCount }] = await queryRunner.query(`
        SELECT COUNT(*)::int AS count FROM "foss_demo_order_items";
      `);
      if (itemsCount > 0) {
        throw new Error(
          `Migration aborted: "foss_demo_order_items" contains ${itemsCount} rows. Safety check requires zero rows before dropping demo tables.`,
        );
      }
    }

    // 3. Validate zero rows in foss_demo_orders if present
    if (existingTableNames.includes('foss_demo_orders')) {
      const [{ count: ordersCount }] = await queryRunner.query(`
        SELECT COUNT(*)::int AS count FROM "foss_demo_orders";
      `);
      if (ordersCount > 0) {
        throw new Error(
          `Migration aborted: "foss_demo_orders" contains ${ordersCount} rows. Safety check requires zero rows before dropping demo tables.`,
        );
      }
    }

    // 4. Verify no unexpected external inbound foreign keys reference demo tables
    const inboundForeignKeys = await queryRunner.query(`
      SELECT
        tc.table_name AS dependent_table,
        kcu.column_name AS dependent_column,
        ccu.table_name AS referenced_table,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = current_schema()
        AND ccu.table_name IN ('foss_demo_orders', 'foss_demo_order_items')
        AND tc.table_name NOT IN ('foss_demo_orders', 'foss_demo_order_items');
    `);

    if (inboundForeignKeys.length > 0) {
      const dependents = inboundForeignKeys
        .map(
          (fk: { dependent_table: string; constraint_name: string }) =>
            `${fk.dependent_table} (${fk.constraint_name})`,
        )
        .join(', ');
      throw new Error(
        `Migration aborted: Unexpected inbound foreign key references found pointing to demo tables: ${dependents}`,
      );
    }

    // 5. Verify no database views depend on demo tables
    const dependentViews = await queryRunner.query(`
      SELECT view_name
      FROM information_schema.view_table_usage
      WHERE view_schema = current_schema()
        AND table_name IN ('foss_demo_orders', 'foss_demo_order_items');
    `);

    if (dependentViews.length > 0) {
      const views = dependentViews
        .map((v: { view_name: string }) => v.view_name)
        .join(', ');
      throw new Error(
        `Migration aborted: Dependent database views detected referencing demo tables: ${views}`,
      );
    }

    // 6. Drop internal foreign key constraint on foss_demo_order_items if present
    if (existingTableNames.includes('foss_demo_order_items')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'FK_foss_demo_order_items_order_id'
              AND table_name = 'foss_demo_order_items'
              AND table_schema = current_schema()
          ) THEN
            ALTER TABLE "foss_demo_order_items" DROP CONSTRAINT "FK_foss_demo_order_items_order_id";
          END IF;
        END $$;
      `);

      // Drop child table without CASCADE
      await queryRunner.query(`DROP TABLE "foss_demo_order_items" RESTRICT;`);
    }

    // 7. Drop primary demo table without CASCADE
    if (existingTableNames.includes('foss_demo_orders')) {
      await queryRunner.query(`DROP TABLE "foss_demo_orders" RESTRICT;`);
    }
  }

  /**
   * Rollback restores schema definition only.
   * NOTE: Recreating empty tables via down() restores table definitions and indexes.
   * It is NOT a recovery method for previously deleted data.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_demo_orders" (
        "order_id" VARCHAR(100) NOT NULL,
        "booking_id" UUID NOT NULL,
        "room_number" VARCHAR(10) NOT NULL,
        "status" VARCHAR(30) NOT NULL DEFAULT 'PLACED',
        "total_amount" NUMERIC(10,2) NOT NULL,
        "allergy_notes" VARCHAR(300),
        "idempotency_key" VARCHAR(128) NOT NULL,
        "estimated_delivery_minutes" INT NOT NULL DEFAULT 25,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_foss_demo_orders_order_id" PRIMARY KEY ("order_id"),
        CONSTRAINT "UQ_foss_demo_orders_idempotency_key" UNIQUE ("idempotency_key")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_demo_orders_booking_room"
        ON "foss_demo_orders" ("booking_id", "room_number");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "foss_demo_order_items" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "order_id" VARCHAR(100) NOT NULL,
        "menu_item_id" VARCHAR(100) NOT NULL,
        "name" VARCHAR(200) NOT NULL,
        "unit_price" NUMERIC(10,2) NOT NULL,
        "quantity" INT NOT NULL,
        "special_notes" VARCHAR(300),
        CONSTRAINT "PK_foss_demo_order_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_foss_demo_order_items_order_id"
          FOREIGN KEY ("order_id")
          REFERENCES "foss_demo_orders"("order_id")
          ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_foss_demo_order_items_order_id"
        ON "foss_demo_order_items" ("order_id");
    `);
  }
}
