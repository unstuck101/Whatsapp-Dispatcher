'use strict';

const axios = require('axios');

const BUILD_PATTERN = /\b(?:build|deploy|fix|code|coding|error|bug|stack ?trace|architecture|refactor|agent|n8n|vps|api|endpoint|webhook|systemd|docker|node|python|regex|schema|migration|db query|prompt|LLM|token|repo|commit|push|pull request|PR|merge|branch|CI|CD|logs?|nginx|caddy|ssl)\b/i;

const BUSINESS_PATTERN = /\b(?:client|clients|email|inbox|call|calls|schedule|calendar|invoice|invoicing|proposal|lead|leads|campaign|social|post|content|community|GHL|onboard|refund|dispute|review|VA|hire|hiring|payroll|contract|nda|dm|voxer|whatsapp|instagram|linkedin|facebook|tiktok|youtube|podcast)\b/i;

const CLASSIFIER_SYSTEM = 'Classify the user message as exactly one word: "build", "business", or "unclear". Respond with only the single word.';

const BUILD_SYSTEM =
  "You are Travis's build lieutenant, answering via a WhatsApp dispatcher. Be concise: max ~150 words. Prefer concrete commands and file paths over prose. If the ask is large, propose a plan in numbered steps and ask which to start.";

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function countMatches(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let count = 0;
  while (re.exec(text) !== null) count += 1;
  return count;
}

function applyManualOverride(text) {
  const trimmed = text.trim();
  if (/^!build\b/i.test(trimmed)) {
    return { route: 'build', message: trimmed.replace(/^!build\s*/i, '').trim() };
  }
  if (/^!biz\b/i.test(trimmed) || /^!business\b/i.test(trimmed)) {
    return {
      route: 'business',
      message: trimmed.replace(/^!(?:biz|business)\s*/i, '').trim(),
    };
  }
  return null;
}

function regexClassify(text) {
  const buildHits = countMatches(text, BUILD_PATTERN);
  const businessHits = countMatches(text, BUSINESS_PATTERN);

  if (buildHits > 0 && businessHits === 0) return 'build';
  if (businessHits > 0 && buildHits === 0) return 'business';
  return null;
}

async function callAnthropic({ apiKey, model, system, userMessage, maxTokens = 1024 }) {
  const response = await axios.post(
    ANTHROPIC_URL,
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const block = response.data?.content?.find((b) => b.type === 'text');
  return (block?.text || '').trim();
}

async function classifyWithHaiku(apiKey, model, text) {
  const raw = await callAnthropic({
    apiKey,
    model,
    system: CLASSIFIER_SYSTEM,
    userMessage: text,
    maxTokens: 16,
  });

  const word = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (word === 'build' || word === 'business' || word === 'unclear') return word;
  return 'unclear';
}

/**
 * Classify an inbound message into build | business | unclear.
 * Returns { route, message } where message has manual-override prefix stripped.
 */
async function classify(text, config) {
  const override = applyManualOverride(text);
  if (override) return override;

  const fast = regexClassify(text);
  if (fast) return { route: fast, message: text };

  const route = await classifyWithHaiku(config.anthropicApiKey, config.classifierModel, text);
  return { route, message: text };
}

async function askClaude(text, config) {
  return callAnthropic({
    apiKey: config.anthropicApiKey,
    model: config.buildModel,
    system: BUILD_SYSTEM,
    userMessage: text,
    maxTokens: 512,
  });
}

async function pushToBoard(text, config) {
  const payload = {
    target: 'task_board',
    timestamp: new Date().toISOString(),
    source: 'dispatcher',
    from: 'Travis',
    message: text,
  };

  await axios.post(config.boardWebhookUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
    maxRedirects: 5,
  });
}

module.exports = {
  classify,
  askClaude,
  pushToBoard,
  BUILD_SYSTEM,
  CLASSIFIER_SYSTEM,
};
