import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { instance } from "./lib/instance-config";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    ADMIN_EMAILS: z
      .string()
      .optional()
      .default("")
      .transform((val) =>
        val
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.url(),
    FIREBASE_CLIENT_EMAIL: z.email().endsWith("iam.gserviceaccount.com").optional(),
    FIREBASE_PRIVATE_KEY: z
      .string()
      .transform((key) => key.replaceAll(/\\n/gm, "\n"))
      .refine((key) => key.startsWith("-----BEGIN PRIVATE KEY-----\n"), {
        message:
          "FIREBASE_PRIVATE_KEY must start with '-----BEGIN PRIVATE KEY-----'",
      })
      .refine((key) => key.endsWith("-----END PRIVATE KEY-----\n"), {
        message:
          "FIREBASE_PRIVATE_KEY must end with '-----END PRIVATE KEY-----'",
      }).optional(),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
    SITE_URL: z.url().default("http://localhost:3000"),
    CRON_SCHEDULER_TOKEN: z.string().optional().default(""),
    CRON_LOCAL_TOKEN: z.string().optional().default(""),
    CRON_INTERNAL_TOKEN: z.string().optional().default(""),
    GCP_PROJECT_ID: z.string().optional().default(""),
    CLOUD_TASKS_LOCATION: z.string().optional().default(""),
    ELECTION_TASK_QUEUE: z.string().optional().default(""),
    ELECTION_TASK_SERVICE_ACCOUNT: z.string().optional().default(""),
    BILL_ADVANCE_SCHEDULE_UTC: z.string().optional().default(instance.game.billAdvanceScheduleUtc),
    GAME_ADVANCE_SCHEDULE_UTC: z.string().optional().default(instance.game.gameAdvanceScheduleUtc),
    ELECTION_TIME_MULTIPLIER: z.coerce.number().positive().default(1),
    DEPLOYED_ENV: z.string().optional().default("local"),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "VITE_",

  client: {
    VITE_FIREBASE_API_KEY: z.string().min(1),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1),
    VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
    VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    VITE_FIREBASE_APP_ID: z.string().min(1),
    VITE_FIREBASE_MEASUREMENT_ID: z.string().optional(),
    VITE_FIREBASE_AUTH_EMULATOR_URL: z.url().optional(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    // Server-side variables from process.env
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    DATABASE_URL: process.env.DATABASE_URL,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    SITE_URL: process.env.SITE_URL,
    CRON_SCHEDULER_TOKEN: process.env.CRON_SCHEDULER_TOKEN,
    CRON_LOCAL_TOKEN: process.env.CRON_LOCAL_TOKEN,
    CRON_INTERNAL_TOKEN: process.env.CRON_INTERNAL_TOKEN,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    CLOUD_TASKS_LOCATION: process.env.CLOUD_TASKS_LOCATION,
    ELECTION_TASK_QUEUE: process.env.ELECTION_TASK_QUEUE,
    ELECTION_TASK_SERVICE_ACCOUNT: process.env.ELECTION_TASK_SERVICE_ACCOUNT,
    BILL_ADVANCE_SCHEDULE_UTC: process.env.BILL_ADVANCE_SCHEDULE_UTC,
    GAME_ADVANCE_SCHEDULE_UTC: process.env.GAME_ADVANCE_SCHEDULE_UTC,
    ELECTION_TIME_MULTIPLIER: process.env.ELECTION_TIME_MULTIPLIER,
    DEPLOYED_ENV: process.env.DEPLOYED_ENV,
    // Client-side variables from import.meta.env
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env
      .VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    VITE_FIREBASE_AUTH_EMULATOR_URL: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL,
  },

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,

  onValidationError: (issues) => {
    console.error(
      "❌ Invalid environment variables:",
      JSON.stringify(issues, null, 2),
    );
    throw new Error("Invalid environment variables");
  },
});
