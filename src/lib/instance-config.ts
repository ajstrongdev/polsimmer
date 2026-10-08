import { z } from "zod";
import oscana from "../../instances/oscana.json";
import { parseUtcCronSchedule } from "./utils/utc-schedule";
import { contrast } from "./color-schemes";

const nonempty = z.string().trim().min(1);
const publicAsset = z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|[?#]))[\w/.-]+$/, "Use a local public asset path");
const webUrl = z.url().refine((value) => /^https?:\/\//.test(value), "Use an HTTP(S) URL");
const schedule = nonempty.refine((value) => {
  try { parseUtcCronSchedule(value); return true; } catch { return false; }
}, "Invalid UTC schedule");
const defaultColors = z.object({
  mode: z.enum(["light", "dark"]),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).refine((colors) => contrast(colors.background, colors.foreground) >= 7, {
  message: "Background and text need at least 7:1 contrast",
  path: ["foreground"],
}).refine((colors) => contrast(colors.background, colors.primary) >= 4.5, {
  message: "Primary colour needs at least 4.5:1 contrast against the background",
  path: ["primary"],
});

export const instanceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: nonempty,
  nationName: nonempty,
  description: nonempty,
  domain: webUrl,
  locale: nonempty.refine((value) => { try { new Intl.Locale(value); return true; } catch { return false; } }, "Invalid locale"),
  timeZone: nonempty.refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid time zone"),
  branding: z.object({
    logo: publicAsset,
    icon: publicAsset,
    socialName: nonempty.default("Social"),
  }),
  social: z.object({
    community: webUrl.optional(),
  }).default({}),
  terminology: z.object({
    president: nonempty.default("President"),
    senate: nonempty.default("Senate"),
    house: nonempty.default("House"),
    party: nonempty.default("Party"),
  }).default({ president: "President", senate: "Senate", house: "House", party: "Party" }),
  features: z.object({
    social: z.boolean().default(true),
    browserNotifications: z.boolean().default(true),
  }).default({ social: true, browserNotifications: true }),
  game: z.object({
    billAdvanceScheduleUtc: schedule.default("0 4,12,20 * * *"),
    gameAdvanceScheduleUtc: schedule.default("0 20 * * *"),
  }).default({ billAdvanceScheduleUtc: "0 4,12,20 * * *", gameAdvanceScheduleUtc: "0 20 * * *" }),
  theme: z.object({
    default: z.enum(["light", "dark", "dracula", "rose-pine", "catppuccin-dark", "t3", "nord", "solarized-light", "solarized", "Default (Light)", "Default (Dark)", "Dracula", "Rosé Pine", "Catppuccin", "Nord", "Solarized (Light)", "Solarized"]).default("dark"),
    colors: defaultColors.optional(),
  }).default({ default: "dark" }),
});

export type InstanceConfig = z.infer<typeof instanceSchema>;

export function parseInstanceConfig(value: unknown): InstanceConfig {
  const result = instanceSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid instance configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Vite embeds the public override at build time; Node scripts read the same variable.
const override = (import.meta.env?.VITE_INSTANCE_CONFIG ??
  (typeof process !== "undefined" ? process.env.VITE_INSTANCE_CONFIG : undefined));
let selected: unknown = oscana;
if (override) {
  try {
    selected = JSON.parse(override);
  } catch {
    throw new Error("Invalid VITE_INSTANCE_CONFIG: expected a JSON object");
  }
}
export const instance = parseInstanceConfig(selected);
