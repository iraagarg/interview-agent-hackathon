import Groq from 'groq-sdk';
import { config } from '../config.js';

let client = null;
const getClient = () => (client ??= new Groq({ apiKey: config.groqApiKey }));

/**
 * One structured call to Groq. Always JSON mode — every prompt in this app asks
 * for an object, never prose, so the response can be validated before use.
 *
 * Retries once on a transport error or unparseable body. Callers are expected
 * to catch and degrade rather than let a turn fail: see engine.js.
 */
async function call({ system, user, temperature, maxTokens, json }) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const completion = await getClient().chat.completions.create({
        model: config.groqModel,
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new Error('Groq returned an empty completion.');
      if (!json) return raw;

      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Groq returned JSON that is not an object.');
      }
      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(`[groq] attempt ${attempt} failed: ${err.message?.slice(0, 200)}`);
    }
  }

  throw new Error(`Groq call failed after 2 attempts: ${lastError?.message?.slice(0, 200)}`);
}

/** Structured call. Used for short outputs where JSON mode is reliable. */
export async function chatJSON({ system, user, temperature = 0.6, maxTokens = 900, mock }) {
  if (config.mockLlm) {
    if (!mock) throw new Error('MOCK_LLM is on but this call site provided no mock.');
    // Yield the event loop before returning. A synchronous mock would make every
    // turn run start-to-finish without interruption, hiding the interleaving
    // that a real awaited network call permits — so concurrency bugs would be
    // invisible under MOCK_LLM and only appear in production.
    await new Promise((resolve) => setTimeout(resolve, config.mockLatencyMs));
    return typeof mock === 'function' ? mock() : mock;
  }
  return call({ system, user, temperature, maxTokens, json: true });
}

/**
 * Plain-text call, for long prose outputs parsed from labelled lines.
 *
 * JSON mode is unreliable on llama-3.3-70b once the values get long: it emits
 * unquoted strings and drops commas mid-prose, and the call 400s with
 * json_validate_failed. Groq's schema-enforcing json_schema mode only covers
 * the gpt-oss models, not Llama. Asking for `LABEL: text` lines removes the
 * failure class entirely — there is no JSON for the model to malform, and the
 * parse is a regex.
 */
export async function chatText({ system, user, temperature = 0.4, maxTokens = 900, mock }) {
  if (config.mockLlm) {
    if (!mock) throw new Error('MOCK_LLM is on but this call site provided no mock.');
    // Yield the event loop before returning. A synchronous mock would make every
    // turn run start-to-finish without interruption, hiding the interleaving
    // that a real awaited network call permits — so concurrency bugs would be
    // invisible under MOCK_LLM and only appear in production.
    await new Promise((resolve) => setTimeout(resolve, config.mockLatencyMs));
    return typeof mock === 'function' ? mock() : mock;
  }
  return call({ system, user, temperature, maxTokens, json: false });
}
