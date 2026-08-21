'use strict';

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { loadEnv, ensureDir } = require('./config');
const { classify, askClaude, pushToBoard } = require('./router');

const config = loadEnv();
ensureDir(path.dirname(config.logFile));
ensureDir(config.waSessionDir);

function log(level, msg, meta = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  });
  console.log(line);
  try {
    fs.appendFileSync(config.logFile, `${line}\n`);
  } catch (err) {
    console.error('log write failed:', err.message);
  }
}

function isAllowedInbound(msg) {
  if (msg.fromMe) return false;
  if (!msg.from || msg.from.endsWith('@g.us')) return false;
  if (msg.from === 'status@broadcast') return false;
  if (msg.isStatus) return false;
  return msg.from === config.travisChatId;
}

function buildPuppeteerConfig() {
  const puppeteer = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  };

  if (config.puppeteerExecutablePath) {
    puppeteer.executablePath = config.puppeteerExecutablePath;
  }

  return puppeteer;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: config.waSessionDir }),
  puppeteer: buildPuppeteerConfig(),
});

let ready = false;
let shuttingDown = false;

const queue = [];
let draining = false;

async function sendToTravis(text) {
  if (!ready) throw new Error('client not ready');
  await client.sendMessage(config.travisChatId, text);
}

async function handleInbound(msg) {
  const body = (msg.body || '').trim();
  if (!body) {
    log('info', 'empty message ignored', { from: msg.from });
    return;
  }

  log('info', 'processing inbound', { from: msg.from, preview: body.slice(0, 80) });

  let route;
  let messageText;

  try {
    ({ route, message: messageText } = await classify(body, config));
  } catch (err) {
    log('error', 'classification failed', { error: err.message });
    await sendToTravis('[dispatcher] classification error — try again.');
    return;
  }

  log('info', 'route selected', { route });

  if (route === 'build') {
    if (!config.anthropicApiKey) {
      await sendToTravis('[dispatcher] ANTHROPIC_API_KEY missing.');
      return;
    }
    try {
      const reply = await askClaude(messageText, config);
      await sendToTravis(reply || '[dispatcher] empty Claude response.');
    } catch (err) {
      log('error', 'build route failed', { error: err.message });
      await sendToTravis('[dispatcher] Claude call failed — check logs.');
    }
    return;
  }

  if (route === 'business') {
    if (!config.boardWebhookUrl) {
      await sendToTravis('[dispatcher] BOARD_WEBHOOK_URL missing.');
      return;
    }
    try {
      await pushToBoard(messageText, config);
      await sendToTravis('Routed to CHIEF board.');
    } catch (err) {
      log('error', 'board push failed', { error: err.message });
      await sendToTravis('[dispatcher] board write failed — check BOARD_WEBHOOK_URL.');
    }
    return;
  }

  await sendToTravis(
    'Route unclear. Reply with build or biz (or prefix with !build / !biz next time).'
  );
}

async function drainQueue() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const msg = queue.shift();
    try {
      await handleInbound(msg);
    } catch (err) {
      log('error', 'handler error', { error: err.message });
    }
  }

  draining = false;
}

function enqueue(msg) {
  queue.push(msg);
  drainQueue().catch((err) => log('error', 'queue drain failed', { error: err.message }));
}

client.on('qr', (qr) => {
  log('info', 'QR received — scan with WhatsApp Linked Devices');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  log('info', 'authenticated — session restored or new login complete');
});

client.on('auth_failure', (msg) => {
  log('error', 'auth failure', { detail: msg });
  process.exit(1);
});

client.on('ready', () => {
  ready = true;
  log('info', 'READY — dispatcher live', { travisChatId: config.travisChatId });
});

client.on('message', (msg) => {
  if (!isAllowedInbound(msg)) {
    log('info', 'ignored inbound', { from: msg.from, type: msg.type });
    return;
  }
  enqueue(msg);
});

client.on('disconnected', (reason) => {
  log('error', 'disconnected', { reason });
  if (!shuttingDown) process.exit(1);
});

process.on('SIGINT', () => {
  shuttingDown = true;
  log('info', 'SIGINT — shutting down');
  client.destroy().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  log('info', 'SIGTERM — shutting down');
  client.destroy().finally(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled rejection', { error: String(reason) });
});

log('info', 'starting whatsapp dispatcher', {
  travisChatId: config.travisChatId,
  waSessionDir: config.waSessionDir,
});

client.initialize().catch((err) => {
  log('error', 'client init failed', { error: err.message });
  process.exit(1);
});
