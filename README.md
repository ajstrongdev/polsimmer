# Oscana

For other Polsimmer deployments, see [instance configuration](docs/INSTANCE_CONFIGURATION.md). Oscana remains the default profile.

Oscana is a TanStack Start game application with PostgreSQL and Firebase Authentication. This branch (`revival`) is an unfinished rewrite of the `develop` version. See [the rewrite notes](docs/REVIVAL_OVERVIEW.md) for the main product changes and known gaps.

## Local development

Use Node.js 24, Bun 1.4.2, PostgreSQL 17, and Firebase credentials. Copy `.env.example` to `.env`, fill it, then run:

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

`bun run seed:fresh` resets game data. Use it only for a new or disposable database. The scheduler can be run locally with `CRON_INTERNAL_TOKEN` set to the local cron token and `APP_BASE_URL=http://localhost:3001`.

To clone the VPS **production** database into the local `.env` database, set `OSCANA_VPS_SSH=deploy@your-ssh-alias` in your local `.env` (or export it in your shell) and run `bun run db:sync:vps --dry-run`, then `bun run db:sync:vps --yes`. This creates a fresh VPS backup via SSH, downloads it, backs up your local database and replaces **only** the loopback local database. The default VS Code Oscana task still requires `OSCANA_VPS_SSH` in VS Code's environment; it does not load `.env`. It restores a fresh production backup into its new disposable PostgreSQL container before starting. It never imports Firebase credentials or copies live auth identities; the emulator provides local sign-in only. See [VPS deployment](deploy.md#clone-production-to-local-development) for details.

To test party permissions on a **local development database**, first make sure AJ (`ajstrongdev@pm.me`) belongs to an active party with another active, unappointed member. Run `bun run db:seed:party-leader`, `bun run db:seed:chief-whip`, or `bun run db:seed:social-media-officer` to switch AJ to that post. These commands do not reset the database, but replace the incumbent in the chosen post; moving AJ out of the leadership post assigns an eligible party member as successor. Set `PARTY_TEST_EMAIL` to use another existing party member instead. They refuse non-local database hosts and production mode. The admin panel's **Database Users** tab can create a database-only player with an email and username; no Firebase account or invitation is created. A player needs a matching Firebase login before they can sign in.

## VPS

The supported deployment is one Ubuntu VPS with two independent Docker Compose projects. Each has its own app, scheduler, PostgreSQL container, database volume, secrets, and Git checkout. Development is live; production is intentionally offline. Host Caddy provides HTTPS for development and an explicit production offline response. See [the VPS runbook](deploy.md) for bootstrap, updates, backups, and recovery.

The host needs Docker, Compose, Caddy, and Git. Node and PostgreSQL run only in containers. Firebase Authentication remains an external service. The initial VPS deployment shares one Firebase project by operator choice; use separate Firebase projects when identities and credentials must be isolated too.

## Documentation

- [Revival rewrite overview](docs/REVIVAL_OVERVIEW.md)
- [VPS deployment](deploy.md)
- [Firebase Authentication](docs/FIREBASE_AUTH.md)
- [Bill lifecycle](docs/BILL_HANDOVER.md)
- [Bot API](docs/BOT_API.md)
- [API operations and release checks](docs/API_OPERATIONS.md)

GNU GPL v3.0; see [LICENSE](LICENSE).
