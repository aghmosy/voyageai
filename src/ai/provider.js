// AI Provider abstraction layer
// Exposes: complete({system, messages, tools, jsonSchema}) → parsed result

import { completeAnthropic } from './anthropic.js';
import { completeOpenAI } from './openai.js';

export async function complete({ provider, apiKey, model, system, messages, tools, jsonSchema, baseUrl }) {
  let result;
  if (provider === 'anthropic') {
    result = await completeAnthropic({ apiKey, model, system, messages, tools, jsonSchema });
  } else if (provider === 'openai') {
    result = await completeOpenAI({ apiKey, model, system, messages, tools, jsonSchema });
  } else if (provider === 'azure') {
    result = await completeOpenAI({ apiKey, model, system, messages, tools, jsonSchema, baseUrl, isAzure: true });
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return result;
}

// Parse JSON from AI response, stripping markdown fences
export function parseJSON(text) {
  // Strip markdown code fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

// Test connection to the AI provider
export async function testConnection(provider, apiKey, model, baseUrl) {
  try {
    const result = await complete({
      provider,
      apiKey,
      model,
      system: 'You are a helpful assistant. Respond with exactly: {"status":"ok"}',
      messages: [{ role: 'user', content: 'Hello, respond with the JSON status object.' }],
      jsonSchema: null,
      tools: null,
      baseUrl
    });
    return { success: true, message: 'Connection successful!' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Default models per provider
export const DEFAULT_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (recommended)' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (faster/cheaper)' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (most capable)' }
  ],
  openai: [
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini (recommended)' },
    { id: 'gpt-4.1', name: 'GPT-4.1 (more capable)' },
    { id: 'gpt-4o', name: 'GPT-4o' }
  ],
  azure: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }
  ]
};
