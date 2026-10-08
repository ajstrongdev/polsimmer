# Instance configuration

Polsimmer ships with the Oscana profile at [`instances/oscana.json`](../instances/oscana.json). Without an override, development, builds and fresh seeds use this profile. Start from the fully populated, copy-ready [`instances/example.json`](../instances/example.json), or copy Oscana's profile and edit it. For standalone seed commands, set `VITE_INSTANCE_CONFIG` to the profile's **JSON contents**; for example:

```sh
export VITE_INSTANCE_CONFIG="$(cat instances/my-nation.json)"
bun run build
```

JSON does not support comments, so `instances/example.json` is valid, uncommented JSON. To leave optional settings disabled in your own profile, delete those fields; the defaults below will apply. For a commented reference while editing, optional examples are shown in JSONC (JSON with comments):

```jsonc
{
  "id": "my-nation", // Unique lowercase slug; also used to namespace browser drafts/events.
  "name": "My Nation", // Instance/community name shown in the app.
  "nationName": "The Republic of Example", // Used when creating the nation in a fresh seed.
  "description": "A player-led political world.",
  "domain": "https://example.org", // Public canonical URL; use your real domain.
  "locale": "en-US", // BCP 47 locale.
  "timeZone": "UTC", // IANA time zone.
  "branding": {
    "logo": "/logo.png", // Root-relative file in public/.
    "icon": "/favicon.ico",
    "socialName": "Public Square" // Optional; defaults to "Social".
  },
  // Optional. Omit community if you don't have an instance Discord/community.
  "social": { "community": "https://discord.gg/your-invite-code" },
  "terminology": { // Optional; omitted labels use these defaults.
    "president": "President",
    "senate": "Senate",
    "house": "House",
    "party": "Party"
  },
  "features": { // Optional; both default to true. These hide UI, not access-control gates.
    "social": true,
    "browserNotifications": true
  },
  "theme": { // Optional; defaults to dark. Use a built-in ID or display label.
    "default": "Default (Dark)",
    // Optional custom default palette; use accessible six-digit hex colors.
    "colors": {
      "mode": "dark",
      "background": "#111827",
      "foreground": "#f9fafb",
      "primary": "#60a5fa",
      "accent": "#34d399"
    }
  },
  "game": { // Optional UTC cron schedules.
    "billAdvanceScheduleUtc": "0 4,12,20 * * *",
    "gameAdvanceScheduleUtc": "0 20 * * *"
  }
}
```

Remove comment markers and comments before saving: application config must be strict JSON. If you provide `theme.colors`, its `mode` controls the shared **Default** palette, replacing the built-in light/dark defaults. Players can still choose alternate themes or return to **Default** from the theme picker.

Set `VITE_INSTANCE_CONFIG=instances/dev.json` in the checkout's `.env` for local Vite development/builds or VPS deployments via `scripts/vps.sh`. Both resolve the path relative to the checkout and load its JSON; the VPS script also passes it to the seed container. An empty or absent value keeps the Oscana default. Direct Compose builds and standalone seed commands still require JSON contents, not a path. The profile contains **public data only** and is embedded into browser assets. Do not include secrets. Restart Vite or rebuild after edits; runtime changes do not change already-built browser assets. Use the same profile for application and seed commands. Supply the usual independent Firebase, database, `SITE_URL`, domain/DNS and deployment credentials for each installation.

The contract is the Zod `instanceSchema` in [`src/lib/instance-config.ts`](../src/lib/instance-config.ts). Required: `id` (lowercase slug, also namespaces browser events/drafts), `name`, `nationName` (fresh seed), `description`, `domain` (absolute URL), `locale` (valid BCP 47 tag), `timeZone` (IANA zone), and `branding.logo` / `branding.icon` (root-relative paths under `public/`). Validation rejects missing or invalid values with an `Invalid instance configuration` error. Put new image assets under `public/` and reference them by URL; `public/logo.png` and `public/favicon.ico` preserve Oscana's existing assets. Never put a private URL or key here.

Optional fields and defaults:

| Field | Default / purpose |
| --- | --- |
| `branding.socialName` | `Social`; name of the in-game social feed |
| `social.community` | absent; instance/nation community link shown in game navigation and login help. Polsimmer product footer links are fixed and not configurable per instance. |
| `terminology.president`, `.senate`, `.house`, `.party` | `President`, `Senate`, `House`, `Party`; display terminology (persisted roles, stages, API values and URLs remain unchanged) |
| `features.social`, `.browserNotifications` | `true`; hide the social navigation entry or the browser notification invitation; **not access-control gates** |
| `theme.default` | `dark`; a built-in theme ID (such as `dracula`) or label (such as `Default (Dark)`); used when a player has not chosen a theme |
| `theme.colors` | absent; optional shared default palette with `mode`, `background`, `foreground`, `primary`, and `accent` six-digit hex colors; players can choose alternatives |
| `game.billAdvanceScheduleUtc`, `.gameAdvanceScheduleUtc` | `0 4,12,20 * * *` and `0 20 * * *`; server scheduling defaults, still overridable by `BILL_ADVANCE_SCHEDULE_UTC` and `GAME_ADVANCE_SCHEDULE_UTC` |

The current political simulation uses fixed internal offices, stages and election mechanics. Terminology here is presentation-only; changing government structure or disabling features end-to-end requires additional implementation. Database `game_settings` and existing nation records remain persistent per-instance state, not deployment configuration. Historical migrations and Oscana-specific E2E guards are intentionally not renamed: they are database history and safety mechanisms, not instance branding. Demo election fixtures in `scripts/seed.ts` are not a production initialization path; use `seed:fresh` on a disposable database only.
