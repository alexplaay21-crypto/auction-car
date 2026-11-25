#!/usr/bin/env bash
# Установка бота на сервере (Ubuntu/Debian). Запускается из папки проекта на сервере: sudo bash deploy/install.sh
# Ставит Node.js 24 и Caddy (HTTPS), собирает мини-приложение, загружает базу из data/dump.json
# (только при первой установке), запускает службу carauction. Повторный запуск — обновление.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
[ -f deploy/server.env ] || { echo "нет deploy/server.env (скопируйте deploy/server.env.example)"; exit 1; }
set -a; . deploy/server.env; set +a
[ -n "${BOT_TOKEN:-}" ] || { echo "в deploy/server.env не задан BOT_TOKEN"; exit 1; }
. /etc/os-release; case "$ID" in ubuntu|debian) ;; *) echo "нужен Ubuntu или Debian (сейчас: $ID)"; exit 1;; esac
IP="${SERVER_IP:-$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')}"
DOMAIN="${DOMAIN:-$IP.sslip.io}"

echo "== пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "node $(node -v), $(caddy version | head -1)"

echo "== пользователь и права"
id carauction >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin carauction
mkdir -p data

echo "== зависимости и сборка мини-приложения"
npm install --omit=dev --no-audit --no-fund >/dev/null
npm --prefix web install --no-audit --no-fund >/dev/null
npm --prefix web run build >/dev/null

echo "== настройки"
cat > .env <<ENV
BOT_TOKEN=$BOT_TOKEN
BOT_USERNAME=${BOT_USERNAME:-binaiobot}
MINI_APP_URL=https://$DOMAIN/
PORT=8080
DB_PATH=$APP_DIR/data/game.db
ENV
chmod 600 .env deploy/server.env

echo "== база"
if [ ! -f data/game.db ]; then
  if [ -f data/dump.json ]; then node --no-warnings server/import-dump.mjs data/dump.json data/game.db
  else echo "data/dump.json нет — будет новая пустая база"; fi
else
  cp data/game.db "data/game.db.bak-$(date +%Y%m%d-%H%M%S)"; echo "база уже есть — оставлена (копия сохранена рядом)"
fi
chown -R carauction:carauction "$APP_DIR"

echo "== служба"
cat > /etc/systemd/system/carauction.service <<UNIT
[Unit]
Description=Car Auction — бот и мини-приложение
After=network-online.target
Wants=network-online.target
[Service]
User=carauction
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node --no-warnings server/main.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
CADDY
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
systemctl daemon-reload
systemctl enable --now carauction >/dev/null
systemctl restart carauction
systemctl reload caddy 2>/dev/null || systemctl restart caddy
sleep 4
systemctl is-active --quiet carauction && echo "служба carauction работает" || { journalctl -u carauction -n 30 --no-pager; exit 1; }
echo
echo "ГОТОВО. Мини-приложение: https://$DOMAIN/"
echo "В @BotFather: /mybots → бот → Bot Settings → Configure Mini App → URL: https://$DOMAIN/"
echo "Логи: journalctl -u carauction -f"
