#!/usr/bin/env bash
# Sobe o preview da Nexora mesmo num sandbox "frio" (node_modules ausente,
# .git resetado, .env.local sumido). Idempotente: pode rodar várias vezes.
#
#   bash scripts/preview-up.sh          # porta 3000
#   PORT=4000 bash scripts/preview-up.sh
#
# Login demo (seed): alex.chen@nexora.dev / Nexora@123
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${BRANCH:-arena/01a0d9e7-my-cronograma}"

# 1) Worktree = último commit da sessão (o .git do sandbox pode vir resetado
#    para o commit inicial; o trabalho está pushado no branch da sessão).
if git fetch -q origin "$BRANCH" && git rev-parse FETCH_HEAD >/dev/null 2>&1; then
  git reset --hard FETCH_HEAD
  echo "[preview-up] worktree alinhado com origin/$BRANCH ($(git log --oneline -1 | cut -d' ' -f1))"
fi

# 2) Dependências. --ignore-scripts porque o postinstall roda `prisma generate`,
#    que precisa baixar binários (bloqueado em sandbox sem rede para isso).
if [ ! -x node_modules/.bin/next ]; then
  echo "[preview-up] instalando dependências..."
  npm install --ignore-scripts --no-audit --no-fund
  git checkout -- package-lock.json 2>/dev/null || true
fi

# 3) Env local de teste (gitignored).
if [ ! -f .env.local ]; then
  cat > .env.local <<'ENV'
DATABASE_URL="postgresql://nexora:nexora@localhost:26257/nexora?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="harness-secret-0123456789abcdef0123456789abcdef"
CRON_SECRET="harness-cron-secret"
NOTIFICATIONS_CRON_SECRET="harness-cron-secret"
ENV
  echo "[preview-up] .env.local criado"
fi

# 4) PrismaClient em memória + seed (só quando ausentes).
if [ ! -f node_modules/.prisma/client/default.js ] || [ ! -f node_modules/.prisma/inmemory-db.json ]; then
  echo "[preview-up] gerando client em memória + seed..."
  node scripts/dev-inmemory-prisma.cjs --reset
  npm run db:seed
fi

# 5) Servidor (bind 0.0.0.0 para o proxy do preview alcançar).
echo "[preview-up] subindo next dev na porta ${PORT:-3000}..."
exec npm run dev -- -H 0.0.0.0 -p "${PORT:-3000}"
