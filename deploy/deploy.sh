#!/usr/bin/env bash
# Перенос/обновление бота на сервере с вашего компьютера (Linux, macOS, Windows через WSL или Git Bash):
#   1) cp deploy/server.env.example deploy/server.env  и впишите IP, пароль, токен
#   2) bash deploy/deploy.sh
# Копирует проект на сервер (в /opt/carauction) и запускает там deploy/install.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/server.env ] || { echo "сначала: cp deploy/server.env.example deploy/server.env и заполните"; exit 1; }
set -a; . deploy/server.env; set +a
[ -n "${SERVER_IP:-}" ] || { echo "в deploy/server.env не задан SERVER_IP"; exit 1; }
SSH_OPTS=(-p "${SSH_PORT:-22}" -o StrictHostKeyChecking=accept-new)
SSH=(ssh "${SSH_OPTS[@]}")
if [ -n "${SERVER_PASSWORD:-}" ]; then
  command -v sshpass >/dev/null || { echo "для входа по паролю нужен sshpass (Ubuntu: sudo apt install sshpass, macOS: brew install hudochenkov/sshpass/sshpass) — или войдите по ключу"; exit 1; }
  export SSHPASS="$SERVER_PASSWORD"; SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
fi
TARGET="${SERVER_USER:-root}@$SERVER_IP"
echo "== копирую проект на $SERVER_IP"
tar czf - --exclude=node_modules --exclude=web/node_modules --exclude=.git --exclude=.tgcloud --exclude=data/game.db \
  --exclude='data/*.bak-*' --exclude=web/dist . | "${SSH[@]}" "$TARGET" 'mkdir -p /opt/carauction && tar xzf - -C /opt/carauction'
echo "== устанавливаю"
"${SSH[@]}" -t "$TARGET" 'cd /opt/carauction && if [ "$(id -u)" -eq 0 ]; then bash deploy/install.sh; else sudo bash deploy/install.sh; fi'
