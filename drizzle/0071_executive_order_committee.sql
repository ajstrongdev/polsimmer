ALTER TABLE "executive_orders" ADD COLUMN "committee_ends_at" timestamp;
ALTER TABLE "executive_orders" ADD COLUMN "enacted_at" timestamp;
UPDATE "executive_orders" SET "committee_ends_at" = "created_at", "enacted_at" = "created_at";
ALTER TABLE "executive_orders" ALTER COLUMN "committee_ends_at" SET NOT NULL;
ALTER TABLE "executive_order_effects" ALTER COLUMN "effect" TYPE double precision USING "effect"::double precision;
