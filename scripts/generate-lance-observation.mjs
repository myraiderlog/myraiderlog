import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const archivePath = new URL('../lance-observations.json', import.meta.url);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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

function fallbackObservation() {
  const states = [
    'Survivor Shame',
    'Mercy Conflict',
    'Memory Looping',
    'Fear Architecture',
    'Attachment Hazard',
    'Numbness Rejected',
    'Human Signal Stable',
    'Guilt Recursion',
    'Compassion Fatigue',
    'Surface Residue',
  ];
  const lenses = [
    'the mind prosecuting itself for making it home',
    'mercy becoming a reflex before strategy can interrupt',
    'a memory that behaves less like evidence and more like a locked room',
    'fear building exits inside places that are already safe',
    'the brain turning strangers into people quickly enough to grieve them',
    'feeling surviving where numbness would be easier',
    'the surface leaving fingerprints on otherwise steady hands',
    'survival arriving with an apology attached',
  ];
  const asides = [
    'Lance note: I am not studying whether Arceology can survive. I am studying what survival is doing to the parts of them that still answer to a name.',
    'Lance note: The body came back. The question is how much of the person had to stay behind to make room for it.',
    'Lance note: Some raiders learn to go quiet inside. Arceology keeps transmitting. That may be why the signal hurts.',
    'Lance note: I keep trying to separate wound from witness. The surface has made that difficult.',
    'Lance note: The brain of a raider is not broken because it remembers. It breaks when every memory demands a verdict.',
  ];
  const observationFragments = [
    ['after extraction', 'Subject looked at the recovered supplies with the expression of someone waiting for them to accuse back.'],
    ['clinical margin', 'The pause before answering was longer than the question required. That is usually where the buried part speaks.'],
    ['quiet finding', 'No tremor noted. No visible injury. Emotional response remains the loudest symptom in the room.'],
    ['watch period', 'Subject smiled at a harmless remark, then withdrew from the smile as if it belonged to someone safer.'],
    ['private conclusion', 'The surface is not only testing whether Arceology can endure harm. It is testing whether they can endure caring.'],
    ['behavioral marker', 'Subject remembered a voice with more precision than the route out. Tactical memory is not always the memory that wins.'],
    ['file note', 'If this is instability, it is the kind that keeps a person from becoming useful in all the worst ways.'],
    ['post-run silence', 'The room was quiet enough to hear them thinking. I do not like how often that sounds like blame.'],
  ];

  const nowSlot = Math.floor(Date.now() / (1000 * 60 * 60 * 3));
  const pick = (items, offset = 0) => items[(nowSlot + offset) % items.length];
  const state = pick(states);
  const lens = pick(lenses, 2);
  const observations = [pick(observationFragments, 1), pick(observationFragments, 4), pick(observationFragments, 7)];

  return {
    state,
    note: `Subject presents another variation of ${lens}. The pattern is not tactical failure. It is the cost of remaining psychologically available in a world that rewards emotional shutdown.`,
    aside: pick(asides, 3),
    guilt: clamp(72 + ((nowSlot * 7) % 25)),
    mercy: clamp(60 + ((nowSlot * 11) % 35)),
    human: clamp(84 + ((nowSlot * 5) % 17)),
    observations,
  };
}

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

async function generateObservation() {
  if (!apiKey) return fallbackObservation();

  try {
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
      console.warn(`OpenAI API returned ${response.status}; using fallback observation.`);
      return fallbackObservation();
    }

    const result = await response.json();
    const outputText = result.output_text
      ?? result.output?.flatMap((item) => item.content || []).map((part) => part.text || '').join('')
      ?? '';

    return extractJson(outputText);
  } catch (error) {
    console.warn(`OpenAI generation failed; using fallback observation. ${error.message}`);
    return fallbackObservation();
  }
}

const generated = await generateObservation();
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
