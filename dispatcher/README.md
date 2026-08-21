# Unstuck WhatsApp Dispatcher

Routes Travis's inbound WhatsApp to **build** (Claude Sonnet reply) or **business** (Google Sheet via webhook).

## Deploy

```bash
scp -r dispatcher root@n8n.joinunstuck.com:/root/
ssh root@n8n.joinunstuck.com "bash /root/dispatcher/install.sh"
ssh root@n8n.joinunstuck.com "journalctl -u dispatcher -f -n 200"
```

QR prints in journal on first run. Scan from Fold8:

**WhatsApp → Settings → Linked Devices → Link a Device**

Watch for `READY — dispatcher live`. Pin the dispatcher chat on Fold8.

## Env

Copy `.env.example` → `.env`. `install.sh` auto-fills `ANTHROPIC_API_KEY` from shell env or `/etc/environment` if placeholder.

| Var | Purpose |
|-----|---------|
| `TRAVIS_WA_NUMBER` | Whitelist source (digits only) |
| `ANTHROPIC_API_KEY` | Claude API |
| `ANTHROPIC_BUILD_MODEL` | Sonnet for build replies |
| `ANTHROPIC_CLASSIFIER_MODEL` | Haiku for tie-breaks |
| `BOARD_WEBHOOK_URL` | Apps Script web app |
| `WA_SESSION_DIR` | Persistent WA session |
| `LOG_FILE` | JSON log file |
| `PUPPETEER_EXECUTABLE_PATH` | Optional Chromium path |

## Routing

1. **Manual override** — prefix `!build`, `!biz`, or `!business`
2. **Regex fast-path** — whole-word match on build/business keyword lists
3. **Haiku fallback** — ties or no match → one-word classifier

| Route | Action |
|-------|--------|
| `build` | Claude Sonnet reply in chat |
| `business` | POST to Task Board → ack "Routed to CHIEF board." |
| `unclear` | Ask Travis to reply build or biz |

## Hard rules

- Only `13016553575@c.us` triggers action
- Groups (`@g.us`) and statuses ignored
- Reacts only — never initiates outbound
- Replies only to Travis's chat
- Serialized queue — one message at a time
- Session persists in `.wwebjs_auth/` across restarts
- Disconnect → exit 1 → systemd restart

## Tests

```text
build test:   "what's my n8n version?"           → Claude reply ~10s
biz test:     "draft email to Renz"              → "Routed to CHIEF board." + sheet row
ambiguous:    "thoughts?"                        → route unclear prompt
override:     "!build thoughts?"                 → build route (forced)
other number: any message                         → silent ignore + log
restart:      systemctl restart dispatcher         → no new QR scan
kill:           kill process                       → systemd back within 10s
```

## Logs

```bash
journalctl -u dispatcher -f -n 200
tail -f /root/dispatcher/dispatcher.log
```

## Webhook redeploy

Reference `board_webhook.gs`. Deploy as Apps Script Web App (Execute as: Me, Anyone access). Update `BOARD_WEBHOOK_URL` in `.env`.

## Service

```bash
systemctl status dispatcher
systemctl restart dispatcher
systemctl stop dispatcher
```

Unit file: `dispatcher.service` → `/etc/systemd/system/dispatcher.service`
