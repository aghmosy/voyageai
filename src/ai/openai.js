// OpenAI / Azure OpenAI Chat API implementation
import { parseJSON } from './provider.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AZURE_API_VERSION = '2024-10-21';

function buildRequest({ apiKey, model, system, messages, tools, jsonSchema, baseUrl, isAzure }) {
  let url;
  let headers = { 'Content-Type': 'application/json' };

  if (isAzure && baseUrl) {
    // Azure OpenAI format:
    // https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...
    const base = baseUrl.trim().replace(/\/+$/, '');
    const deployment = (model || 'gpt-4o').trim();
    url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`;
    headers['api-key'] = apiKey;
  } else {
    url = OPENAI_URL;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = {
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    // Detailed multi-day itineraries can exceed 4K output tokens. Truncating
    // them mid-object produces JSON.parse errors that look like bad syntax.
    max_tokens: 8192
  };

  // Standard OpenAI needs model in body; Azure gets it from the URL
  if (!isAzure) {
    body.model = model || 'gpt-4.1-mini';
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => {
      if (t.type === 'web_search') {
        return {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the web for information',
            parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
          }
        };
      }
      return t;
    });
  }

  // Request JSON mode if schema expected
  if (jsonSchema !== null) {
    body.response_format = { type: 'json_object' };
  }

  return { url, headers, body };
}

export async function completeOpenAI({ apiKey, model, system, messages, tools, jsonSchema, baseUrl, isAzure: forceAzure }) {
  const isAzure = forceAzure || (baseUrl && (baseUrl.includes('openai.azure.com') || baseUrl.includes('azure')));

  const { url, headers, body } = buildRequest({ apiKey, model, system, messages, tools, jsonSchema, baseUrl, isAzure });

  let response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      throw new Error('Request timed out after 2 minutes. The AI may be overloaded — please try again.');
    }
    // Network-level failure
    if (isAzure) {
      throw new Error(
        `Network error connecting to Azure OpenAI. ` +
        `URL: ${url.split('?')[0]} — ` +
        `Check: 1) Endpoint URL is correct, 2) Deployment name "${model}" exists, ` +
        `3) Your network allows access. (${fetchError.message})`
      );
    }
    throw new Error(`Network error: ${fetchError.message}`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Invalid API key. Please check your API key.');
    if (response.status === 404) throw new Error(isAzure
      ? `Deployment "${model}" not found. Check your deployment name and endpoint URL.`
      : `Model "${model}" not found.`);
    if (response.status === 429) throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content || '';

  if (jsonSchema !== null && textContent) {
    try {
      return { parsed: parseJSON(textContent), raw: textContent, toolResults: [] };
    } catch (e) {
      // Retry once asking for JSON only
      const retryMessages = [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'assistant', content: textContent },
        { role: 'user', content: 'Your previous response was not valid JSON. Please respond with ONLY the JSON object.' }
      ];
      const retryReq = buildRequest({ apiKey, model, system, messages: retryMessages, tools, jsonSchema, baseUrl, isAzure });
      retryReq.body.messages = retryMessages;
      const retryResponse = await fetch(retryReq.url, {
        method: 'POST',
        headers: retryReq.headers,
        body: JSON.stringify(retryReq.body)
      });
      if (!retryResponse.ok) throw new Error('Failed to get valid JSON from AI');
      const retryData = await retryResponse.json();
      const retryText = retryData.choices?.[0]?.message?.content || '';
      try {
        return { parsed: parseJSON(retryText), raw: retryText, toolResults: [] };
      } catch {
        throw new Error('The AI returned malformed JSON twice. Please try generating the itinerary again.');
      }
    }
  }

  return { parsed: null, raw: textContent, toolResults: [] };
}
