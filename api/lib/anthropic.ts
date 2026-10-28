import { AI_DISABLED_MESSAGE, AI_ENABLED } from '../../src/lib/aiFeature.js';

export { AI_DISABLED_MESSAGE, AI_ENABLED };

/** Sohbet ve araştırma uçlarının kapalı yanıtı. HTTP 200; hata değil. */
export function aiDisabledBody() {
  return {
    success: true as const,
    disabled: true as const,
    message: AI_DISABLED_MESSAGE,
  };
}

/**
 * api.anthropic.com'a giden tek çıkış.
 * AI_ENABLED false iken fetch hiç çağrılmaz — anahtar duruyor olsa bile.
 */
export async function callAnthropicMessages(
  apiKey: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  if (!AI_ENABLED) {
    throw new Error(AI_DISABLED_MESSAGE);
  }
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
