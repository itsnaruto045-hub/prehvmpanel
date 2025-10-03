#!/usr/bin/env bash
# Helper to create an A record using Cloudflare API from .env variables.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$DIR/.env" ] || { echo ".env not found in project root"; exit 1; }
source $DIR/.env
if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ] || [ -z "$CF_HOSTNAME" ]; then
  echo "CF_API_TOKEN, CF_ZONE_ID and CF_HOSTNAME must be set in .env"
  exit 1
fi
IP=$(curl -s https://ipv4.icanhazip.com)
echo "Registering $CF_HOSTNAME -> $IP"
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records"  -H "Authorization: Bearer $CF_API_TOKEN"  -H "Content-Type: application/json"  --data "{"type":"A","name":"$CF_HOSTNAME","content":"$IP","ttl":120,"proxied":false}"  | jq '.'
echo "Done. Verify DNS propagation before enabling Cloudflare proxying."
