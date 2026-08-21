'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Normalize a phone number to WhatsApp chat ID format.
 * Accepts: 13016553575, +13016553575, 13016553575@c.us
 */
function toChatId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw.endsWith('@c.us')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@c.us`;
}

function loadEnv() {
  const travisChatId = toChatId(process.env.TRAVIS_WA_NUMBER);
  if (!travisChatId) {
    throw new Error('TRAVIS_WA_NUMBER is required and must be a valid phone number');
  }

  return {
    travisChatId,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    buildModel: process.env.ANTHROPIC_BUILD_MODEL || 'claude-sonnet-5',
    classifierModel: process.env.ANTHROPIC_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001',
    boardWebhookUrl: process.env.BOARD_WEBHOOK_URL || '',
    alertEmail: process.env.ALERT_EMAIL || 'admin@joinunstuck.com',
    waSessionDir: process.env.WA_SESSION_DIR || path.join(__dirname, '.wwebjs_auth'),
    logFile: process.env.LOG_FILE || path.join(__dirname, 'dispatcher.log'),
    puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = { loadEnv, toChatId, ensureDir };
