#!/usr/bin/env sh
set -eu

: "${APP_ENV_FILE:?}"
: "${DATABASE_ENV_FILE:?}"
: "${HOST_IP:?}"
export APP_ENV_FILE DATABASE_ENV_FILE
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-uroute-app}"

compose() {
  docker compose --env-file "$APP_ENV_FILE" "$@"
}

web_port=$(grep -E '^WEB_PORT=' "$APP_ENV_FILE" | cut -d= -f2)
[ -n "$web_port" ]

docker version --format '{{.Server.Version}}'
docker compose version

docker ps --format '{{.Names}}\t{{.Ports}}'
owners=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E ":${web_port}->" | cut -d' ' -f1 | grep -v "^${COMPOSE_PROJECT_NAME}-web-" || true)
if [ -n "$owners" ]; then
  echo "Port ${web_port} is already used by: ${owners}"
  exit 1
fi

compose build
compose up -d --wait database
compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d postgres -q' < deploy/init-database.sql
compose run --rm -T api bun apps/api/src/auth/migrate.ts --apply
compose run --rm -T api bun apps/api/src/trips/migrate.ts --apply
compose up -d --wait

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://${HOST_IP}:${web_port}/health"; then
    echo
    exit 0
  fi
  sleep 3
done
compose logs --tail 100 api web
exit 1
