ALTER TABLE "executive_orders" ADD COLUMN "description" text NOT NULL DEFAULT '';
CREATE TABLE "executive_order_effects" (
  "order_id" integer NOT NULL REFERENCES "executive_orders"("id") ON DELETE CASCADE,
  "stat_key" varchar(100) NOT NULL REFERENCES "nation_stat_definitions"("key"),
  "effect" integer NOT NULL,
  "applied_change" double precision NOT NULL,
  PRIMARY KEY ("order_id", "stat_key")
);
INSERT INTO "executive_order_effects" ("order_id", "stat_key", "effect", "applied_change")
  SELECT "id", "stat_key", "effect", "applied_change" FROM "executive_orders";
ALTER TABLE "executive_orders" DROP COLUMN "stat_key";
ALTER TABLE "executive_orders" DROP COLUMN "effect";
ALTER TABLE "executive_orders" DROP COLUMN "applied_change";
ALTER TABLE "executive_orders" ALTER COLUMN "description" DROP DEFAULT;
