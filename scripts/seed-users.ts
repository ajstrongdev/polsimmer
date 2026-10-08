import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import pg from "pg";

if (!process.env.DATABASE_URL) loadEnvFile(process.env.COMPOSE_ENV_FILE ?? ".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const file = process.argv[2] ?? "scripts/default-users.json";
const users: unknown = JSON.parse(await readFile(file, "utf8"));
const columns = [
  "email", "username", "bio", "pronouns", "photo_url", "avatar_config",
  "political_leaning", "role", "party_id", "is_active", "last_activity",
  "moderation_role", "is_ancestry_root",
] as const;
if (!Array.isArray(users)) throw new Error("Users JSON must be an array");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  for (const [index, value] of users.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`User ${index + 1} must be an object`);
    }
    const user = value as Record<string, unknown>;
    if (typeof user.email !== "string" || !user.email.trim() || typeof user.username !== "string" || !user.username.trim()) {
      throw new Error(`User ${index + 1} requires email and username`);
    }
    const keys = Object.keys(user);
    if (keys.some((key) => !columns.includes(key as (typeof columns)[number]))) {
      throw new Error(`User ${index + 1} contains an unsupported users column`);
    }
    const fields = columns.filter((column) => column in user);
    await client.query(
      `INSERT INTO users (${fields.map((column) => `"${column}"`).join(", ")}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT (email) DO NOTHING`,
      fields.map((column) => column === "avatar_config" && user[column] != null ? JSON.stringify(user[column]) : user[column]),
    );
  }
  await client.query("COMMIT");
  console.log(`Seeded ${users.length} default user record(s) from ${file}; existing emails were left unchanged.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
