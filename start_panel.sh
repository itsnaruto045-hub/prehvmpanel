#!/usr/bin/env bash
set -e
echo -n "Do you want to start this panel? (y/n) "
read -n1 REPLY
echo
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  if systemctl list-unit-files | grep -q vps-panel.service; then
    echo "Starting systemd service vps-panel.service..."
    systemctl start vps-panel.service
    systemctl status vps-panel.service --no-pager
  else
    echo "Starting node server in background..."
    nohup node /opt/vps-control-panel/server.js >/var/log/vps-panel.log 2>&1 &
    echo "Started (check /var/log/vps-panel.log)."
  fi
else
  echo "Aborted. Panel not started."
fi
