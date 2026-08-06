import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'https://api.anthropic.com/v1/complete';
const DEFAULT_MODEL = 'claude-2';

export default async function callClaude(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY environment variable.');

  const body = {
    model: options.model || DEFAULT_MODEL,
    prompt,
    max_tokens_to_sample: options.max_tokens || 300
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data;
}
