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
/** Models to try in order: the primary, then the separate-quota fallback. */
export function modelChain() {
  const chain = [config.groqModel];
  if (config.groqFallbackModel && config.groqFallbackModel !== config.groqModel) {
    chain.push(config.groqFallbackModel);
  }
  return chain;
}

async function attempt({ model, system, user, temperature, maxTokens, json }) {
  const completion = await getClient().chat.completions.create({
    model,
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
}

async function call({ system, user, temperature, maxTokens, json }) {
  let lastError;

  // Two tries per model — the first covers a transient error or a malformed
  // body, the second model covers the primary's daily quota running out.
  for (const model of modelChain()) {
    for (let tries = 1; tries <= 2; tries += 1) {
      try {
        const result = await attempt({ model, system, user, temperature, maxTokens, json });
        if (model !== config.groqModel) console.warn(`[groq] served by fallback model ${model}`);
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`[groq] ${model} try ${tries}: ${err.message?.slice(0, 160)}`);

        // A quota or auth failure will not fix itself on a retry of the same
        // model — move straight on to the next one.
        const message = err.message || '';
        if (message.includes('429') || message.includes('401') || message.includes('404')) break;
      }
    }
  }

  throw new Error(`Groq call failed on all models: ${lastError?.message?.slice(0, 160)}`);
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
