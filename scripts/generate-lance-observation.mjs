import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const archivePath = new URL('../lance-observations.json', import.meta.url);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY. Add it as a GitHub Actions repository secret.');
}

function clamp(value, min = 48, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 75;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return a JSON object.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function readArchive() {
  try {
    return JSON.parse(await readFile(archivePath, 'utf8'));
  } catch {
    return { updatedAt: null, observations: [] };
  }
}

const archive = await readArchive();
const recent = (archive.observations || []).slice(0, 8).map((entry) => ({
  state: entry.state,
  note: entry.note,
  aside: entry.aside,
}));

const prompt = `
You are writing as Lance, Field Medic of the Speranza Underground, studying Arceology's raider psychology.

Write ONE new living-archive observation. It must feel gripping, intimate, clinical, poetic, and unsettling.
It is not factual raid tracking. It is Lance trying to understand the brain of a raider:
- guilt after survival
- mercy as a dangerous reflex
- memory loops
- fear becoming architecture
- the refusal to become numb
- the difference between wounds and psychological residue
- why Arceology keeps feeling everything and still goes back

Avoid generic game language. Avoid stats talk. Avoid motivational slogans.
Do not repeat these recent entries:
${JSON.stringify(recent, null, 2)}

Return ONLY valid JSON with this exact shape:
{
  "state": "2-4 word psychological state title",
  "note": "1-2 sentences, Lance's clinical/poetic reading",
  "aside": "1 Lance note sentence, intimate and gripping",
  "guilt": 48-100,
  "mercy": 48-100,
  "human": 48-100,
  "observations": [
    ["short timestamp label", "1 gripping psychological observation sentence"],
    ["short timestamp label", "1 gripping psychological observation sentence"],
    ["short timestamp label", "1 gripping psychological observation sentence"]
  ]
}
`;

const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    input: prompt,
    max_output_tokens: 900,
  }),
});

if (!response.ok) {
  throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
}

const result = await response.json();
const outputText = result.output_text
  ?? result.output?.flatMap((item) => item.content || []).map((part) => part.text || '').join('')
  ?? '';

const generated = extractJson(outputText);
const now = new Date().toISOString();

const entry = {
  id: `lance-${now.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  createdAt: now,
  state: String(generated.state || 'Unresolved Signal').slice(0, 80),
  note: String(generated.note || '').slice(0, 500),
  aside: String(generated.aside || '').slice(0, 500),
  guilt: clamp(generated.guilt),
  mercy: clamp(generated.mercy),
  human: clamp(generated.human),
  observations: Array.isArray(generated.observations)
    ? generated.observations.slice(0, 3).map((item) => [
        String(item?.[0] || 'observation').slice(0, 40),
        String(item?.[1] || '').slice(0, 300),
      ])
    : [],
};

if (entry.observations.length < 3 || !entry.note || !entry.aside) {
  throw new Error('Generated observation was incomplete.');
}

const nextArchive = {
  updatedAt: now,
  observations: [entry, ...(archive.observations || [])].slice(0, 240),
};

await writeFile(archivePath, `${JSON.stringify(nextArchive, null, 2)}\n`);
console.log(`Wrote ${entry.id}: ${entry.state}`);
