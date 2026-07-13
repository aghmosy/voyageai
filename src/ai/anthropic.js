// Anthropic Messages API implementation
import { parseJSON } from './provider.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

export async function completeAnthropic({ apiKey, model, system, messages, tools, jsonSchema }) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: system
  };

  // Convert messages format
  body.messages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }));

  // Add tools if provided (e.g., web_search)
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Invalid API key. Please check your Anthropic API key.');
    if (response.status === 429) throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 529) throw new Error('Anthropic API is overloaded. Please try again later.');
    throw new Error(errorData.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract text content and tool use results
  let textContent = '';
  let toolResults = [];

  for (const block of data.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolResults.push(block);
    }
  }

  // If we got tool results (web search), we may need to continue
  // For web_search tool, the results are embedded in server_tool_use blocks
  // Anthropic handles web search internally and returns results in text

  // Try to parse as JSON if expected
  if (jsonSchema !== null && textContent) {
    try {
      return { parsed: parseJSON(textContent), raw: textContent, toolResults };
    } catch (e) {
      // Retry once asking for JSON only
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: textContent },
        { role: 'user', content: 'Your previous response was not valid JSON. Please respond with ONLY the JSON object, no markdown fences or extra text.' }
      ];
      const retryResponse = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, messages: retryMessages })
      });
      if (!retryResponse.ok) throw new Error('Failed to get valid JSON from AI');
      const retryData = await retryResponse.json();
      const retryText = retryData.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      try {
        return { parsed: parseJSON(retryText), raw: retryText, toolResults };
      } catch {
        throw new Error('The AI returned malformed JSON twice. Please try generating the itinerary again.');
      }
    }
  }

  return { parsed: null, raw: textContent, toolResults };
}
