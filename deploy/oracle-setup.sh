#!/usr/bin/env bash
set -euo pipefail

# StudyHub Oracle Cloud (Ubuntu 22.04 / 24.04) Always Free Setup Script
# Run from the project root after cloning/uploading: bash deploy/oracle-setup.sh

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "==> [1/6] Installing system tools, SQLite3 & build dependencies..."
sudo apt update
sudo apt install -y git curl build-essential python3 sqlite3 iptables-persistent

echo "==> [2/6] Opening HTTP (80) & HTTPS (443) in Ubuntu iptables..."
if ! sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
fi
if ! sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
fi
sudo netfilter-persistent save || true

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi

echo "==> [3/6] Installing Node.js 20 LTS & PM2 (if missing)..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "==> [4/6] Installing dependencies & building production frontend..."
mkdir -p "$PROJECT_DIR/data" "$HOME/backups"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s|replace-with-a-secure-random-secret-key|$SECRET|" "$PROJECT_DIR/.env"
  echo "Created .env with generated JWT_SECRET. Review $PROJECT_DIR/.env to verify ADMIN_EMAIL!"
fi

npm run install:all
npm run build

echo "==> [5/6] Starting StudyHub with PM2..."
pm2 start ecosystem.config.cjs
pm2 save
echo "Run the startup command printed below if prompted so PM2 boots automatically after reboot:"
pm2 startup || true

echo "==> [6/6] Installing Caddy & setting up daily SQLite backup cron..."
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt update && sudo apt install -y caddy
fi

CRON_JOB="0 3 * * * /usr/bin/sqlite3 $PROJECT_DIR/data/studyhub.db \".backup '$HOME/backups/studyhub-\$(date +\\%F).db'\" && find $HOME/backups -type f -mtime +7 -delete"
(crontab -l 2>/dev/null | grep -Fv "studyhub.db" ; echo "$CRON_JOB") | crontab -

echo ""
echo "====================================================================="
echo "Setup complete! Local server health check:"
curl -s http://127.0.0.1:3000/health || true
echo ""
echo "Next steps:"
echo "  1. Open ports 80 & 443 in Oracle Cloud Console -> VCN -> Security List."
echo "  2. Edit /etc/caddy/Caddyfile using deploy/Caddyfile.example with your"
echo "     DuckDNS or <PUBLIC_IP>.sslip.io domain, then run:"
echo "       sudo systemctl enable caddy && sudo systemctl restart caddy"
echo "====================================================================="
