#!/bin/bash
# Set Telegram webhook for Ava Brain
# Usage: ./scripts/set-webhook.sh
# Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET as env vars

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN is not set"
  exit 1
fi

WEBHOOK_URL="${WEBHOOK_URL:-https://ava-brain.your-worker.workers.dev/telegram}"
SECRET_TOKEN="${TELEGRAM_WEBHOOK_SECRET:-$(openssl rand -hex 32)}"

echo "Setting webhook..."
echo "URL: $WEBHOOK_URL"
echo "Secret token: $SECRET_TOKEN"

# Delete existing webhook first
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"

# Set new webhook
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET_TOKEN}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"

echo ""
echo "Done. Check webhook info:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
echo ""