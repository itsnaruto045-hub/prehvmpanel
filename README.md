VPS Control Panel - Improved Package
===================================

This is an upgraded scaffold intended to be a safer starting point toward a production-capable control panel.
It includes:
- Hashed admin provisioning (server will hash provided admin password and store in SQLite on first run).
- HTTPS support (you can supply certificates or use a reverse proxy like nginx + Let's Encrypt).
- Dockerfile for container deployment.
- Cloudflare helper script to create DNS A record using Cloudflare API token.
- Basic security middlewares (helmet, rate-limiting, CSRF token stub) in server code.
- Systemd unit and improved installer.

IMPORTANT SECURITY NOTES (READ CAREFULLY)
- This is still a scaffold. Do NOT run in production without security review.
- Commands executed from the user panel run on the host. This is potentially dangerous. Use OS-level isolation (containers, namespaces) to protect host.
- Use strong, unique admin credentials, enforce HTTPS in front of the app, and lock down access with firewall rules and Cloudflare Access if desired.

Quickstart (Debian/Ubuntu)
1. Upload and extract package to your server.
2. Run: sudo bash installer.sh
3. After installation, open https://your-hostname/admin (or http://IP:3001/admin if no TLS reverse proxy).

To run in Docker:
1. Build: docker build -t vps-panel .
2. Run: docker run -d --restart unless-stopped -p 3001:3001 --name vps-panel vps-panel

