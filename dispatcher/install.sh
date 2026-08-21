#!/usr/bin/env bash
set -euo pipefail

DISPATCHER_DIR="/root/dispatcher"
ENV_FILE="${DISPATCHER_DIR}/.env"
ENV_EXAMPLE="${DISPATCHER_DIR}/.env.example"
SYSTEM_ENV="/etc/environment"

echo "==> Installing Chromium runtime dependencies"
apt-get update
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2t64 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  libu2f-udev \
  libvulkan1 \
  chromium

echo "==> Installing Node dependencies"
cd "${DISPATCHER_DIR}"
npm install --omit=dev

echo "==> Setting up .env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "    Created ${ENV_FILE} from .env.example"
fi

inject_api_key() {
  local key="$1"
  if [[ -z "${key}" ]]; then
    return 1
  fi
  if grep -q '^ANTHROPIC_API_KEY=' "${ENV_FILE}"; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${key}|" "${ENV_FILE}"
  else
    echo "ANTHROPIC_API_KEY=${key}" >> "${ENV_FILE}"
  fi
  echo "    Injected ANTHROPIC_API_KEY"
}

CURRENT_KEY=$(grep '^ANTHROPIC_API_KEY=' "${ENV_FILE}" | cut -d= -f2- || true)
if [[ "${CURRENT_KEY}" == "sk-ant-..." || -z "${CURRENT_KEY}" ]]; then
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    inject_api_key "${ANTHROPIC_API_KEY}"
  elif [[ -f "${SYSTEM_ENV}" ]]; then
    SYS_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "${SYSTEM_ENV}" | cut -d= -f2- | tr -d '"' || true)
    if [[ -n "${SYS_KEY}" ]]; then
      inject_api_key "${SYS_KEY}"
    fi
  fi
fi

if ! grep -q '^PUPPETEER_EXECUTABLE_PATH=' "${ENV_FILE}" 2>/dev/null; then
  if command -v chromium >/dev/null 2>&1; then
    echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" >> "${ENV_FILE}"
    echo "    Set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium"
  fi
fi

mkdir -p "${DISPATCHER_DIR}/.wwebjs_auth"
chmod 700 "${DISPATCHER_DIR}/.wwebjs_auth"

echo "==> Installing systemd unit"
cp "${DISPATCHER_DIR}/dispatcher.service" /etc/systemd/system/dispatcher.service
systemctl daemon-reload
systemctl enable dispatcher
systemctl restart dispatcher

echo ""
echo "==> Dispatcher installed and started"
echo "    Watch logs (QR appears here on first run):"
echo "    journalctl -u dispatcher -f -n 200"
