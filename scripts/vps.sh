#!/usr/bin/env bash
# Run from either VPS checkout as the deploy user.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
test -f .env || { echo "Missing .env" >&2; exit 1; }

value() {
  sed -n "s/^$1=//p" .env | tail -1 | sed 's/^"//; s/"$//'
}
compose() { docker compose --env-file .env "$@"; }
check() {
  local key val profile
  for key in DEPLOYED_ENV COMPOSE_PROJECT_NAME APP_PORT SITE_URL DB_PASSWORD DATABASE_URL CRON_INTERNAL_TOKEN ADMIN_EMAILS FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID; do
    val="$(value "$key")"
    if [[ -z "$val" || "$val" == *CHANGE_ME* || "$val" == *example.com* ]]; then
      echo "Set $key in .env" >&2; return 1
    fi
  done
  [[ "$(value DEPLOYED_ENV)" =~ ^(production|development)$ ]] || { echo "Invalid DEPLOYED_ENV" >&2; return 1; }
  if [[ "$(value DEPLOYED_ENV)" == production ]]; then
    [[ "$(value COMPOSE_PROJECT_NAME)" == democracyonline-production && "$(value APP_PORT)" == 3000 ]] || { echo "Production project or port is incorrect" >&2; return 1; }
  else
    [[ "$(value COMPOSE_PROJECT_NAME)" == democracyonline-development && "$(value APP_PORT)" == 3001 ]] || { echo "Development project or port is incorrect" >&2; return 1; }
  fi
  [[ "$(value SITE_URL)" == https://* ]] || { echo "SITE_URL must be HTTPS" >&2; return 1; }
  [[ "$(value DATABASE_URL)" == "postgresql://democracyonline:$(value DB_PASSWORD)@db:5432/democracyonline" ]] || { echo "DATABASE_URL and DB_PASSWORD do not match this project's database" >&2; return 1; }
  [[ "$(value FIREBASE_PROJECT_ID)" == "$(value VITE_FIREBASE_PROJECT_ID)" ]] || { echo "Firebase project IDs differ" >&2; return 1; }
  [[ "$(value CRON_INTERNAL_TOKEN)" =~ ^[a-f0-9]{64}$ ]] || { echo "CRON_INTERNAL_TOKEN must be 64 hex characters" >&2; return 1; }
  profile="$(value VITE_INSTANCE_CONFIG)"
  if [[ -n "$profile" ]]; then
    [[ -s "$profile" ]] || { echo "Missing instance config file: $profile" >&2; return 1; }
    export VITE_INSTANCE_CONFIG="$(cat "$profile")"
  else
    unset VITE_INSTANCE_CONFIG
  fi
  compose config --quiet
  echo "Configuration OK for $(value DEPLOYED_ENV)"
}
backup() {
  local dir file tmp
  dir="${BACKUP_DIR:-/srv/democracyonline-backups/$(value DEPLOYED_ENV)}"
  mkdir -p "$dir"
  chmod 700 "$dir"
  file="$dir/$(date -u +%Y%m%dT%H%M%SZ).dump"
  tmp="${file}.partial"
  trap 'rm -f "$tmp"' RETURN
  compose exec -T db pg_dump -U democracyonline -d democracyonline --format=custom > "$tmp"
  test -s "$tmp"
  mv "$tmp" "$file"
  trap - RETURN
  echo "Backup: $file"
}
deploy() {
  if [[ "$(value DEPLOYED_ENV)" == production && -e /etc/democracyonline/production-offline ]]; then
    echo "Production is offline; refusing to start its app or scheduler" >&2
    return 1
  fi
  check
  # .git is excluded from the Docker build context. Stamp the built image with
  # the exact checkout revision so the footer reports what is actually running.
  export DEPLOY_COMMIT_SHA="$(git rev-parse --verify HEAD)"
  # Build serially to keep peak memory manageable on a small VPS.
  compose --profile tools build migrator
  compose build app
  compose up -d --wait db
  backup
  compose stop app election-scheduler >/dev/null 2>&1 || true
  compose --profile tools run --rm migrator
  # Fail deployment if the app cannot answer its DB-backed readiness probe.
  compose up -d --wait --remove-orphans app election-scheduler
  compose ps
}

case "${1:-}" in
  check) check ;;
  deploy) deploy ;;
  backup)
    check
    # An offline production backup may need to start its DB temporarily.
    # Keep the stack offline afterward without touching a DB already running.
    if [[ "$(value DEPLOYED_ENV)" == production && -e /etc/democracyonline/production-offline && -z "$(compose ps --status running -q db)" ]]; then
      trap 'compose stop db' EXIT
    fi
    compose up -d --wait db
    backup
    ;;
  seed)
    check
    if [[ "$(value DEPLOYED_ENV)" == production && -e /etc/democracyonline/production-offline ]]; then
      echo "Production is offline; refusing to seed or start it" >&2; exit 1
    fi
    if [[ "$(value DEPLOYED_ENV)" == production && "${2:-}" != --allow-production ]]; then
      echo "Production seed resets game data; pass --allow-production explicitly" >&2; exit 1
    fi
    compose up -d --wait db
    backup
    compose --profile tools build migrator
    compose stop app election-scheduler >/dev/null 2>&1 || true
    if [[ "$(value DEPLOYED_ENV)" == production ]]; then
      compose --profile tools run --rm -e SEED_ALLOW_PRODUCTION=true migrator node --import tsx scripts/seed-fresh.ts
    else
      compose --profile tools run --rm migrator node --import tsx scripts/seed-fresh.ts
    fi
    compose up -d app election-scheduler
    ;;
  restore)
    check
    if [[ "$(value DEPLOYED_ENV)" == production && -e /etc/democracyonline/production-offline ]]; then
      echo "Production is offline; refusing to restore and start it" >&2; exit 1
    fi
    archive="${2:-}"
    [[ -f "$archive" && -s "$archive" ]] || { echo "Restore requires an existing dump file" >&2; exit 1; }
    [[ "${3:-}" == "--confirm-$(value DEPLOYED_ENV)" ]] || { echo "Pass --confirm-$(value DEPLOYED_ENV) to restore this environment" >&2; exit 1; }
    compose up -d --wait db
    backup
    compose stop app election-scheduler >/dev/null 2>&1 || true
    compose exec -T db dropdb -U democracyonline --if-exists --force democracyonline
    compose exec -T db createdb -U democracyonline democracyonline
    compose exec -T db pg_restore -U democracyonline -d democracyonline --no-owner --no-acl --exit-on-error < "$archive"
    compose up -d app election-scheduler
    ;;
  update)
    if [[ "$(value DEPLOYED_ENV)" == production && -e /etc/democracyonline/production-offline ]]; then
      echo "Production is offline; refusing to update and start it" >&2; exit 1
    fi
    test -z "$(git status --porcelain)" || { echo "Checkout is dirty" >&2; exit 1; }
    branch="$(git symbolic-ref --quiet --short HEAD)" || { echo "Checkout is detached" >&2; exit 1; }
    git fetch --prune origin
    git pull --ff-only origin "$branch"
    deploy
    ;;
  deploy-revision)
    # Deploy precisely the commit validated by Actions, not whatever happens to
    # be at the tip of a branch when the SSH step starts.
    revision="${2:-}"
    target="${3:-}"
    [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo "Expected a full commit SHA" >&2; exit 1; }
    [[ "$target" =~ ^(production|development)$ && "$(value DEPLOYED_ENV)" == "$target" ]] || { echo "Wrong deployment target" >&2; exit 1; }
    if [[ "$target" == production && -e /etc/democracyonline/production-offline ]]; then
      echo "Production is offline; refusing to deploy" >&2; exit 1
    fi
    test -z "$(git status --porcelain)" || { echo "Checkout is dirty" >&2; exit 1; }
    check
    git fetch origin "$revision"
    if [[ "$target" == production ]]; then
      git fetch origin main
      git merge-base --is-ancestor "$revision" FETCH_HEAD || { echo "Production revision is not on main" >&2; exit 1; }
    fi
    git switch --detach "$revision"
    deploy
    ;;
  status) compose ps ;;
  logs) compose logs -f --tail=200 ;;
  stop) compose down ;;
  *) echo "Usage: bash scripts/vps.sh {check|deploy|deploy-revision SHA ENV|backup|seed [--allow-production]|restore DUMP --confirm-ENV|update|status|logs|stop}" >&2; exit 2 ;;
esac
