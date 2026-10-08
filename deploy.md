# VPS deployment and recovery

## Architecture

One Ubuntu VPS runs:

| Part | Production | Development |
| --- | --- | --- |
| DNS | `oscana.nya.je` | `dev.oscana.nya.je` |
| Checkout | `/srv/democracyonline-prod` | `/srv/democracyonline-dev` |
| Compose project | `democracyonline-production` | `democracyonline-development` |
| Public route | Offline response (`503`) | Caddy → `127.0.0.1:3001` |
| Database | Private PostgreSQL container and volume | Separate private PostgreSQL container and volume |

Each project has its own `.env`, app, scheduler, database network, and database volume. Database ports are never published. Docker isolates the two projects; Caddy is the only public HTTP entry point. Both apps still use Firebase Authentication. The initial deployment shares one Firebase project by operator choice, so sign-in identities and authentication settings overlap. Move dev to a separate Firebase project and service account for full isolation.

The VPS is a single point of failure. A daily systemd timer and every deploy/seed create local backups, but a backup on the same VPS cannot recover a lost VPS. Arrange an offsite copy of `/srv/democracyonline-backups` and the two `.env` files in a secure store. Test a restore periodically.

## 1. Prepare

Use a recent supported Ubuntu LTS VPS with enough memory and disk for two builds and two databases. Set DNS A records for both domains to the VPS IPv4 address. If using AAAA records, point them to a working VPS IPv6 address. Open inbound TCP 22 (or your custom SSH port), 80, and 443 in Hostinger's firewall; keep 3000, 3001, and 5432 closed. The bootstrap also configures UFW.

Keep root SSH access until the deploy user's login and UFW have been tested. Check any existing `/srv/democracyonline-*` directories, PostgreSQL service, Docker volumes, and `/etc/caddy/Caddyfile` before bootstrap. The script refuses an old `.env` or unrelated Caddyfile; it never deletes old databases or volumes.

Clone this branch on the VPS (or copy the checkout there) and run as root:

```bash
git clone --branch chore/vps-reproducible-deploy https://github.com/ajstrongdev/democracyonline.io.git /root/democracyonline-setup
cd /root/democracyonline-setup
INITIAL_BRANCH=chore/vps-reproducible-deploy bash scripts/vps-bootstrap.sh
```

The branch must be pushed before a fresh VPS can clone it. After review/merge, use the final branch name in both places. Override `REPO_URL`, `PROD_DOMAIN`, `DEV_DOMAIN`, or directories via environment variables if needed. Bootstrap installs Docker/Compose, Caddy, Git, UFW, and a `deploy` user; clones two checkouts; creates mode-600 `.env` files with independent random DB passwords and cron tokens; and configures HTTPS routing and firewall. It is safe to rerun with the same settings. Existing clean checkouts without `.env` switch to `INITIAL_BRANCH`; existing checkouts with `.env` keep their branch and secrets. It starts with production offline and does not seed or launch the app.

On the current VPS, development is running and production's Compose stack is stopped. Both environment files and database volumes already exist. Rerunning bootstrap preserves those files and keeps production offline by default. Host PostgreSQL is installed but unused by this deployment.

The deploy user receives a copy of root's SSH authorized keys if present. Docker group membership lets the deploy user control the host; use a trusted SSH key and restrict that account accordingly. Log in again after bootstrap to pick up group membership. On a host below 6 GiB RAM with no swap, bootstrap creates a 2 GiB `/swapfile`; builds run serially to limit peak memory.

## 2. Fill the environment files

Edit each file as `deploy`:

```bash
sudo -iu deploy
nano /srv/democracyonline-dev/.env
nano /srv/democracyonline-prod/.env
chmod 600 /srv/democracyonline-dev/.env /srv/democracyonline-prod/.env
```

Replace every `CHANGE_ME` value. Keep each generated `DB_PASSWORD`, `DATABASE_URL`, `CRON_INTERNAL_TOKEN`, project name, port, and `SITE_URL` tied to its environment. A PostgreSQL password change requires changing both `DB_PASSWORD` and the password embedded in `DATABASE_URL`; after a database volume exists, rotate the database role password inside PostgreSQL too. Never copy one `.env` over the other.

To use a different profile, set `VITE_INSTANCE_CONFIG=instances/dev.json` in that checkout's `.env` (and commit the public JSON file for Actions deployments). `scripts/vps.sh` reads the path relative to the checkout and supplies its JSON to the app build and seeds. Leave the value blank or unset to use `instances/oscana.json`. Do not use `$(cat ...)` in `.env`. Rebuild to apply profile changes; seeds reset game data.

Firebase values come from the Firebase console as described in [Firebase Authentication](docs/FIREBASE_AUTH.md). For the current shared project, authorize both `oscana.nya.je` and `dev.oscana.nya.je`. When splitting the projects, authorize only the matching hostname in each. Use the service account JSON `project_id`, `client_email`, and JSON-escaped `private_key` in the corresponding `.env`. Put the key on one line, in double quotes, with literal `\n` sequences. `VITE_*` values are browser configuration; the service account private key must stay server-side. Set `ADMIN_EMAILS` to real admin addresses.

Check each configuration:

```bash
cd /srv/democracyonline-dev && bash scripts/vps.sh check
cd /srv/democracyonline-prod && bash scripts/vps.sh check
```

## 3. Deploy development

As `deploy`, from the corresponding checkout:

```bash
cd /srv/democracyonline-dev
bash scripts/vps.sh deploy
bash scripts/vps.sh seed
bash scripts/vps.sh status
curl -I https://dev.oscana.nya.je
```

`deploy` checks configuration, builds the Bun dependency/tooling and app images (`bun install --frozen-lockfile`, then `bun run build` inside Docker), starts its database, makes a timestamped custom-format backup, applies Drizzle migrations, and starts the app and scheduler. A failed image build leaves the running app and scheduler untouched. The VPS does not need a host-side Node, Bun, pnpm, or Corepack install. `seed` resets game data, so run it only once for an empty environment. It also makes a backup first. Create Firebase users for seeded officeholders if needed; see [Firebase Authentication](docs/FIREBASE_AUTH.md). Verify login, admin, a bill stage, and an election advancement on development.

The app now has a database-backed `/api/health` readiness probe, and deploy waits for it before reporting success. This probe does not validate the scheduler, migrations' data semantics, or external services. Follow the pre-production API and migration checklist in [API operations](docs/API_OPERATIONS.md), especially the duplicate-vote preflight before migration 0051.

Production currently stays offline. Its app, scheduler, and database containers are stopped, while its database volume remains available for a later launch. The production hostname returns `503`. The production lock at `/etc/democracyonline/production-offline` makes `deploy`, `update`, `seed`, and `restore` refuse to start it. The daily backup timer skips production while this lock exists.

When you decide to launch production, run these steps in order. Its existing database was seeded during the initial rollout; preserve that data:

```bash
sudo bash /srv/democracyonline-prod/scripts/vps-site.sh unlock
cd /srv/democracyonline-prod
bash scripts/vps.sh deploy
bash scripts/vps.sh status
sudo bash scripts/vps-site.sh online
curl -I https://oscana.nya.je
```

**Do not seed the existing production database again.** `seed --allow-production` resets game data and belongs only in a first-time setup of a genuinely empty database. Migrations are one-way operations; review schema changes and test them on development before updating production.

To take production offline again, run `sudo bash /srv/democracyonline-prod/scripts/vps-site.sh offline`. This switches the hostname to a `503` response, creates the deployment lock, and stops only the production Compose stack. It preserves the database volume.

Check after a reboot: dev's Compose services should be running and `https://dev.oscana.nya.je` should return `200`. Prod's Compose project should be stopped and `https://oscana.nya.je` should return `503`. Docker restart policies apply to the running dev stack; Caddy and Docker are enabled at boot.

## Routine operation

Run as `deploy` from the intended checkout:

```bash
bash scripts/vps.sh update   # fast-forward current branch, backup, migrate, deploy
bash scripts/vps.sh backup   # timestamped pg_dump archive
bash scripts/vps.sh status
bash scripts/vps.sh logs
bash scripts/vps.sh stop     # stops only this environment; preserves its volume
```

`update` refuses dirty or detached checkouts and retains the branch checked out in that environment. Actions deployments leave the checkout detached at the validated commit; for a subsequent manual `update`, first explicitly switch the checkout back to the intended branch. Production updates are blocked while it is offline. Do not use `docker compose down -v`; that removes the database volume. The deployment script never uses `-v`.

### GitHub Actions deployment

The **Deploy VPS** workflow deploys development on a push to `main` (including merges), or manually from a selected branch with target `development`. Production runs **only** from a manual dispatch on `main` with target `production`; pushes never deploy production. A production request first validates and deploys the same commit to development, then waits for QA approval of the `Production` environment before deploying production. Choose the `main` branch in the Actions **Run workflow** dropdown for production; selecting another branch skips both deployments in a production request. QA should verify the dev site and review the SQL/backup and the [pre-production checklist](docs/API_OPERATIONS.md). Reject the pending deployment if QA fails.

Create GitHub environments named `Dev` and `Production` (names are case-sensitive). Configure **Production** with required reviewers (and disable self-review if desired) and a deployment branch rule allowing only `main`; GitHub must be configured with these protection rules for the QA pause to occur—the workflow cannot create them. Restrict who may dispatch workflows and approve production. Configure `Dev` branch rules to permit `main` and any manual development branches you intend to deploy. Store `VPS_HOST`, `VPS_USER=deploy`, `VPS_SSH_KEY`, and optionally `VPS_SSH_PORT` as GitHub Actions secrets: repository secrets may be shared by both jobs, or environment secrets may be set independently. Never put credentials in repository files or workflow inputs. Use a dedicated deploy SSH key, put its public half in `/home/deploy/.ssh/authorized_keys`, and test access before relying on the workflow. The existing per-checkout `.env` remains on the VPS with mode 600; never copy it into Actions logs or artifacts. The deploy user has Docker access and must be treated as privileged.

Each run calls CI (frozen install, typecheck, unit tests, lint, build and isolated E2E with the `oscana_e2e` database and `demo-oscana` Auth Emulator) before an SSH deployment job can start. CI uses dummy Firebase browser values; the VPS builds again using its own `.env` values before touching the running app. The SSH step fetches and deploys the **exact validated commit**, refusing a dirty checkout or the wrong environment; production additionally checks the commit belongs to `main`. The build embeds the checkout's commit SHA in the footer (`source - <short hash>` links to the full GitHub commit), so the displayed hash changes with each deployed revision. It then backs up the target database, runs Drizzle migrations and recreates/waits for the app and scheduler. No seeding is performed. Build failures do not stop the running containers; migration or readiness failures may require manual intervention and migrations are not automatically rolled back. Check the Actions run and environment deployment history for success/failure, then verify `bash scripts/vps.sh status`, `/api/health`, and scheduler logs. If a run fails after migrations start, consult the SSH step logs, preserve the backup, and assess schema compatibility before redeploying or restoring; do not blindly roll back the app against a migrated database.

The production-offline lock still blocks Actions. For the initial launch, explicitly unlock and bring the site online as described above; the workflow does not change Caddy routing or bypass the lock. To retry a failed run, dispatch the workflow again for the correct branch/target after fixing the cause. Since development and production share one VPS, entire deployment runs are serialized, including the QA wait: a later dev run cannot replace the version QA is reviewing. GitHub concurrency keeps only one pending run in a group; a newer queued run can replace an older pending run, so check Actions for superseded runs. Do not use the manual server `update` concurrently with an Actions run.

Backups are written to `/srv/democracyonline-backups/{production,development}` with private permissions. The daily timer runs at 03:30 UTC and backs up dev while prod is offline; inspect it with `systemctl status democracyonline-backup.timer` and `journalctl -u democracyonline-backup.service`. A successful `pg_dump` does not prove recovery: copy backups off the VPS, retain several generations, monitor disk usage, and restore one into a disposable environment. Check archive contents with `docker compose exec -T db pg_restore --list < backup.dump`.

### Clone production to local development

With SSH access as the VPS `deploy` user, set `OSCANA_VPS_SSH=deploy@your-ssh-alias` in your local `.env` (or export it in your shell; an SSH config alias is fine). For the database in your local `.env`, run `bun run db:sync:vps --dry-run` and then `bun run db:sync:vps --yes`. This invokes `scripts/vps.sh backup` in `/srv/democracyonline-prod`, copies the new custom-format archive over SSH, saves a local pre-sync backup, then recreates and restores the **local loopback** database. It refuses remote targets, PostgreSQL servers older than 17, and the E2E database. Requires Node, SSH and SCP, plus either local PostgreSQL 17 client tools or the `my-postgres` Podman/Docker container published on the target port (the script uses that container's `pg_dump` and `pg_restore`). Stop local apps using this database before syncing. Archives in ignored `tmp/vps-backups/` contain private production data; protect and delete them according to your retention policy. Remote archives remain under `/srv/democracyonline-backups/production`. If production is offline, `vps.sh backup` temporarily starts its database container and stops it afterward; it does not start the app or scheduler. The VPS checkout must contain the updated `vps.sh` before relying on this offline behavior.

The default VS Code **Oscana: production clone + isolated app + scheduler** task automatically runs the same SSH backup/copy into a newly created disposable `oscana_e2e` container. Export `OSCANA_VPS_SSH` in VS Code's environment before starting; no fallback seed is used if SSH fails. `OSCANA_VPS_ENV=development` explicitly selects VPS development instead. The local Auth Emulator uses `demo-oscana` and creates local-only credentials; it does **not** copy Firebase Auth accounts. Web Push is disabled for this clone so existing subscriptions cannot receive test notifications. Local scheduler changes affect only the disposable clone. Stop the task to stop its database. Never use the copy as an offsite backup without securing the local machine and testing recovery.

To restore, copy the dump to the VPS, verify its contents, and run the explicit restore command in the **target** checkout:

```bash
cd /srv/democracyonline-dev
bash scripts/vps.sh restore /path/to/backup.dump --confirm-development
```

For production, unlock it first, then use the production checkout and `--confirm-production`. Restore takes one more backup, stops the app and scheduler, replaces only this project's database, restores the archive, and starts the app again. If restore fails, the app stays stopped so you can investigate. Test this process on development before relying on it for production. Keep the matching `.env` and Git revision with an offsite backup; bootstrap can recreate infrastructure but cannot recreate lost game data or Firebase credentials.

## Existing VPS / legacy database

The previous `revival` VPS draft used host PostgreSQL, fixed Docker subnets, and systemd units. Bootstrap deliberately refuses its `.env` and does not migrate that database automatically. If an older deployment is found later: record its current schema/version; take a `pg_dump --format=custom` of each database; copy the dumps offsite; stop the old app/scheduler; and restore into the appropriate new Compose database. Do this first on development. The v3 rewrite also changed schema and seed data; a `develop` database is not known to migrate cleanly into it. Preserve the old database and plan data conversion separately if it matters.

After confirming the new deployment works, disable the old systemd units and host PostgreSQL manually. Do not remove old volumes or host databases until a tested restore and cutover are complete. If the Caddyfile already contains other sites, merge the two proxy blocks manually instead of replacing it.

## Troubleshooting

- If `compose build app` fails with `Reached heap limit Allocation failed - JavaScript heap out of memory` after Vite transforms modules, the builder uses a 4096 MiB Node heap by default. Check VPS RAM/swap with `free -h` and available disk with `df -h`; the host needs additional memory for Docker, PostgreSQL, and build tooling. Set `BUILD_NODE_HEAP_MB` in the checkout's `.env` to override the build-only heap (for example, `3072` on a smaller VPS with swap), then retry the deploy. An OS-level OOM kill or Docker exit 137 means the host/container memory limit is insufficient; increasing the Node heap alone will not fix that. The Framer Motion `"use client"` directive message is a non-fatal bundler warning.
- `bash scripts/vps.sh check` validates required config and Compose syntax without printing secrets.
- `bash scripts/vps.sh status` shows all containers; `bash scripts/vps.sh logs` shows app, database, and scheduler output.
- `docker compose --env-file .env logs election-scheduler` should show successful calls to game, election, and bill advancement endpoints.
- `sudo journalctl -u caddy -n 100` and `sudo caddy validate --config /etc/caddy/Caddyfile` diagnose HTTPS. DNS must point to the VPS and ports 80/443 must be reachable for Caddy certificates.
- Check `sudo ufw status` and Hostinger firewall rules if the site is unreachable. Only Caddy ports and SSH should be public.
- `docker compose --env-file .env exec db pg_isready -U democracyonline -d democracyonline` checks the selected database.
- `curl -fsS https://dev.oscana.nya.je/api/health` checks the app's database readiness; verify `election-scheduler` logs separately.

## Reference documentation

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) and [Compose startup health checks](https://docs.docker.com/compose/how-tos/startup-order/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [PostgreSQL custom-format backup](https://www.postgresql.org/docs/17/app-pgdump.html) and [restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
