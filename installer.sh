#!/usr/bin/env bash
set -e
echo "=== VPS Control Panel Installer (Improved) ==="
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this installer as root or using sudo."
  exit 1
fi

read -p "Admin username: " ADMIN_USER
read -s -p "Admin password: " ADMIN_PASS
echo
read -p "Install Cloudflare integration? (y/n) [n]: " USE_CF
USE_CF=${USE_CF:-n}

read -p "Set custom URL for the panel? (y/n) [n]: " CUSTOM_URL
CUSTOM_URL=${CUSTOM_URL:-n}

if [ "$CUSTOM_URL" = "y" ]; then
  read -p "Enter public hostname (example: panel.example.com): " PANEL_HOSTNAME
  read -p "Enter the port to run the panel on (default 3001): " PANEL_PORT
  PANEL_PORT=${PANEL_PORT:-3001}
else
  PANEL_HOSTNAME=""
  PANEL_PORT=3001
fi

PROJECT_DIR="/opt/vps-control-panel"
mkdir -p "$PROJECT_DIR"
cp -r ./* "$PROJECT_DIR"
cd "$PROJECT_DIR"

cat > .env <<EOF
PORT=${PANEL_PORT}
ADMIN_USER=${ADMIN_USER}
# ADMIN_PASS will be hashed and stored in DB by server on first run
USE_CLOUDFLARE=${USE_CF}
PANEL_HOSTNAME=${PANEL_HOSTNAME}
USE_HTTPS=n
EOF

echo "Installing Node.js and build tools..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nodejs npm openssl curl ca-certificates
elif command -v yum >/dev/null 2>&1; then
  yum install -y nodejs npm openssl curl ca-certificates
else
  echo "Please install Node.js, npm and openssl manually and re-run npm install in $PROJECT_DIR"
fi

echo "Installing project dependencies..."
npm install --production

# Initialize DB and admin user (server will create hashed admin on first run if ADMIN_PASS provided via env)
if [ -n "$ADMIN_PASS" ]; then
  echo "ADMIN_PASS_PROVISION=${ADMIN_PASS}" >> .env
fi

if [ "$USE_CF" = "y" ]; then
  echo "Configuring Cloudflare integration..."
  read -p "Cloudflare API Token (with DNS edit permissions): " CF_API_TOKEN
  read -p "Cloudflare Zone ID: " CF_ZONE_ID
  read -p "Cloudflare Hostname (eg panel.example.com): " CF_HOSTNAME
  cat >> .env <<EOF
CF_API_TOKEN=${CF_API_TOKEN}
CF_ZONE_ID=${CF_ZONE_ID}
CF_HOSTNAME=${CF_HOSTNAME}
EOF
  echo "Cloudflare variables saved to .env. You may still need to run the helper script scripts/cloudflare_setup.sh manually to create DNS records."fi

echo "Create systemd service..."
SERVICE_FILE="/etc/systemd/system/vps-panel.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=VPS Control Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/node ${PROJECT_DIR}/server.js
Restart=on-failure
User=root
Environment=NODE_ENV=production
EnvironmentFile=${PROJECT_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vps-panel.service

echo "Starting the panel now..."
systemctl start vps-panel.service || (nohup node server.js >/var/log/vps-panel.log 2>&1 &)

echo "Installer finished. Admin username: ${ADMIN_USER}. If ADMIN_PASS was provided, server will provision the hashed admin account on first run."
