#!/usr/bin/env bash
# Realinha o branch da sessão com o remote SEM perder o trabalho não commitado.
#
# O sandbox recicla entre turnos e às vezes volta o HEAD para `main` enquanto a
# árvore de trabalho continua com todo o trabalho. Um `git reset --hard` comum
# nessa hora apagaria tudo; este script faz o `reset` misto (move o HEAD, mantém
# a árvore) e mostra o que sobrou de diferença real.
#
# Uso: bash scripts/sync-session.sh
set -euo pipefail

BRANCH="arena/01a0d9e7-my-cronograma"

cd "$(dirname "$0")/.."

echo "== estado antes =="
git log --oneline -1 || true
git status --short | head -10

echo
echo "== buscando o remote =="
git fetch -q origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"

echo "== realinhando (mantém a árvore de trabalho) =="
git reset -q "origin/${BRANCH}"

echo
echo "== agora em =="
git log --oneline -1

echo
echo "== diferença real vs remote =="
git status --short | head -20

if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo
  echo "Nada pendente: árvore idêntica ao remote."
else
  echo
  echo "Há mudanças locais acima. Revise antes de commitar."
fi
