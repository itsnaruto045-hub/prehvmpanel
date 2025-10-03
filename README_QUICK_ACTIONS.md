Quick actions after install (recommended):
- Replace SESSION_SECRET in .env with a long random value.
- Run scripts/cloudflare_setup.sh if using Cloudflare and verify DNS.
- Put nginx in front with TLS (use nginx.example.conf) and Certbot for Let's Encrypt.
- Consider running this inside Docker and bind-mount /var/run/docker.sock only if required.
- Review server.js and remove user exec endpoint or restrict it with container execution.
