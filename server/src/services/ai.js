/**
 * The one place in the API that talks to an external AI model.
 *
 * Every AI-backed feature goes through this module, and its configuration lives
 * in `server/.env` only — never inline in a controller or service:
 *
 *   DEEPSEEK_API_KEY   the credential (absent => AI is simply off)
 *   DEEPSEEK_MODEL     model id, default `deepseek-chat`
 *   DEEPSEEK_BASE_URL  optional, default `https://api.deepseek.com`
 *   DEEPSEEK_THINKING  `off` (default here), `on`, or `auto` to use the API default
 *   DEEPSEEK_TIMEOUT_MS optional, default 20000
 *
 * DeepSeek's thinking mode is enabled by default and bills its chain of thought
 * as output tokens, which makes a short summary slow and expensive. Requests
 * therefore send `{"thinking": {"type": "disabled"}}` unless turned back on;
 * see https://api-docs.deepseek.com/guides/thinking_mode/
 *
 * DeepSeek exposes an OpenAI-compatible `POST /chat/completions` endpoint, so the
 * request body and response shape below are the OpenAI ones. The key travels in
 * the `Authorization` header and is never put in a URL or a log line.
 *
 * Callers must work without this: `isConfigured()` is false when no key is set,
 * and every failure throws `AiError` with a stable `code`, which callers catch
 * and turn into their own local fallback.
 */

const DEFAULTS = {
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  timeoutMs: 20000,
  maxOutputTokens: 1024,
  // This app writes short summaries, so thinking is off unless asked for. It is
  // on by default at the API, and its hidden reasoning is billed as output.
  thinking: 'disabled'
};
const { getGlobalSettings } = require('./systemSettings');

/** Error carrying a stable `code`, so callers can react without string matching. */
class AiError extends Error {
  constructor(message, code = 'ai_error', status = null) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

/** Maps the env kill switch onto the API's `thinking.type` value. */
function thinkingMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return DEFAULTS.thinking;
  if (['off', 'false', 'disabled', 'none', '0', 'no'].includes(value)) return 'disabled';
  if (['on', 'true', 'enabled', '1', 'yes'].includes(value)) return 'enabled';
  if (value === 'auto') return 'auto';
  return DEFAULTS.thinking;
}

/**
 * Reads the DeepSeek settings.
 * `DEEKSEEK_BASE_URL_OPENAI_COMPATIBLE` is accepted as a fallback because it
 * shipped with a typo; it is deprecated in favour of `DEEPSEEK_BASE_URL`.
 */
function settings() {
  const rawBase =
    process.env.DEEPSEEK_BASE_URL ||
    process.env.DEEKSEEK_BASE_URL_OPENAI_COMPATIBLE ||
    '';

  return {
    apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim(),
    model: String(process.env.DEEPSEEK_MODEL || '').trim() || DEFAULTS.model,
    baseUrl: (String(rawBase).trim() || DEFAULTS.baseUrl).replace(/\/+$/, ''),
    thinking: thinkingMode(process.env.DEEPSEEK_THINKING),
    timeoutMs:
      Number(process.env.DEEPSEEK_TIMEOUT_MS) > 0
        ? Number(process.env.DEEPSEEK_TIMEOUT_MS)
        : DEFAULTS.timeoutMs
  };
}

/** True when a key is configured. Never reveals the key itself. */
function isConfigured() {
  return Boolean(settings().apiKey);
}

/** Safe, loggable description of the current configuration. */
function describe() {
  const { model, baseUrl, apiKey, timeoutMs, thinking } = settings();
  return {
    configured: Boolean(apiKey),
    provider: 'deepseek',
    model,
    baseUrl,
    thinking,
    timeoutMs,
    keyPreview: apiKey ? `${apiKey.slice(0, 5)}…${apiKey.slice(-2)}` : null
  };
}

/**
 * Sends one prompt and returns the model's reply text.
 * `json: true` asks DeepSeek for a JSON object (`response_format`).
 */
async function generateText({
  prompt,
  system,
  temperature = 0.7,
  maxOutputTokens = DEFAULTS.maxOutputTokens,
  json = false,
  thinking,
  timeoutMs
} = {}) {
  const config = settings();
  const runtime = await getGlobalSettings();

  if (!runtime.aiEnabled) throw new AiError('AI features are disabled by the administrator.', 'disabled');
  config.model = runtime.aiModel || config.model;
  config.timeoutMs = runtime.aiTimeoutMs || config.timeoutMs;
  const outputTokenLimit = maxOutputTokens === DEFAULTS.maxOutputTokens
    ? runtime.aiMaxOutputTokens
    : maxOutputTokens;

  if (!config.apiKey) {
    throw new AiError('AI is not configured: set DEEPSEEK_API_KEY in server/.env.', 'not_configured');
  }
  if (!prompt || !String(prompt).trim()) {
    throw new AiError('No prompt was supplied.', 'empty_prompt');
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: String(system) });
  messages.push({ role: 'user', content: String(prompt) });

  const mode = thinking || config.thinking;

  const controller = new AbortController();
  const requestTimeout = timeoutMs || config.timeoutMs;
  const timer = setTimeout(() => controller.abort(), requestTimeout);

  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: outputTokenLimit,
        stream: false,
        // `auto` leaves the field out and accepts the API default (thinking on).
        ...(mode === 'auto' ? {} : { thinking: { type: mode } }),
        ...(json ? { response_format: { type: 'json_object' } } : {})
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiError(`The AI request timed out after ${requestTimeout} ms.`, 'timeout');
    }
    throw new AiError(`Could not reach the AI service: ${err.message}`, 'network');
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403 ? 'auth'
        : response.status === 402 ? 'no_balance'
          : response.status === 429 ? 'rate_limited'
            : response.status >= 500 ? 'unavailable'
              : 'bad_request';

    // Pull the API's own message out when there is one; keep it short and free
    // of anything credential-shaped.
    let detail = raw.replace(/\s+/g, ' ').slice(0, 240);
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) detail = String(parsed.error.message).slice(0, 240);
    } catch {
      /* not JSON — the truncated body is better than nothing */
    }

    throw new AiError(`AI request failed (${response.status}): ${detail || 'no detail'}`, code, response.status);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AiError('The AI service returned a response that was not JSON.', 'bad_response');
  }

  const choice = payload.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    throw new AiError('The AI declined to answer (content filter).', 'blocked');
  }

  const text = String(choice?.message?.content || '').trim();
  if (!text) {
    // Reasoning models spend the token budget on `reasoning_content` before any
    // answer is emitted, so a `length` finish with no content means the budget
    // was too small — say that rather than "empty answer".
    if (choice?.finish_reason === 'length') {
      throw new AiError(
        `The model used all ${outputTokenLimit} output tokens on reasoning and produced no answer. Raise maxOutputTokens.`,
        'truncated'
      );
    }
    throw new AiError('The AI service returned an empty answer.', 'empty_response');
  }

  return text;
}

/**
 * Asks for a JSON object and parses it.
 * Tolerates the model wrapping its JSON in a ```json fence or a sentence of
 * prose, because JSON mode is a hint rather than a guarantee.
 */
async function generateJson(options = {}) {
  const text = await generateText({ ...options, json: true });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new AiError('The AI reply did not contain a JSON object.', 'invalid_json');

  try {
    return JSON.parse(match[0]);
  } catch {
    throw new AiError('The AI reply was not valid JSON.', 'invalid_json');
  }
}

module.exports = { AiError, isConfigured, describe, generateText, generateJson, settings, DEFAULTS };
