import { readFile, writeFile } from 'node:fs/promises';

const PROFILE_ID = 'qV5hX1cAAAAJ';
const PROFILE_URL = `https://scholar.google.com/citations?hl=en&user=${PROFILE_ID}&pagesize=100`;
const INDEX_PATH = new URL('../index.html', import.meta.url);
const METRICS_PATH = new URL('../assets/publication-metrics.json', import.meta.url);
const DRY_RUN = process.argv.includes('--dry-run');

const papers = [
  {
    key: 'step-hrl',
    title: 'Hierarchical Reinforcement Learning with Augmented Step-Level Transitions for LLM Agents'
  },
  {
    key: 'hrm-text',
    title: 'HRM-Text: Efficient Pretraining Beyond Scaling'
  }
];

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchScholarProfile() {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(PROFILE_URL, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'
        }
      });

      if (!response.ok) throw new Error(`Google Scholar returned HTTP ${response.status}`);
      const html = await response.text();
      if (!html.includes('gsc_a_tr')) throw new Error('Google Scholar returned no publication rows');
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 5000);
    }
  }

  throw lastError;
}

function extractCitations(html) {
  const results = new Map();
  const rows = html.match(/<tr class="gsc_a_tr">[\s\S]*?<\/tr>/g) ?? [];

  for (const row of rows) {
    const titleMatch = row.match(/class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    const title = decodeHtml(titleMatch[1]);
    const countMatch = row.match(/class="gsc_a_ac gs_ibl"[^>]*>([\d,]*)<\/a>/);
    const count = countMatch?.[1] ? Number(countMatch[1].replaceAll(',', '')) : 0;
    results.set(title, count);
  }

  return results;
}

function replaceCitationCount(html, key, count) {
  const pattern = new RegExp(`(<span data-scholar-citations="${key}">)\\d+(<\\/span>)`);
  if (!pattern.test(html)) throw new Error(`Missing citation target for ${key} in index.html`);
  return html.replace(pattern, (_, opening, closing) => `${opening}${count}${closing}`);
}

const profileHtml = await fetchScholarProfile();
const citationsByTitle = extractCitations(profileHtml);
let homepageHtml = await readFile(INDEX_PATH, 'utf8');
const currentMetrics = JSON.parse(await readFile(METRICS_PATH, 'utf8'));
const summary = {};

for (const paper of papers) {
  if (!citationsByTitle.has(paper.title)) {
    throw new Error(`Paper not found on Google Scholar profile: ${paper.title}`);
  }

  const count = citationsByTitle.get(paper.title);
  homepageHtml = replaceCitationCount(homepageHtml, paper.key, count);
  summary[paper.key] = count;
}

const countsChanged = papers.some(paper => currentMetrics.citations?.[paper.key] !== summary[paper.key]);
const nextMetrics = {
  source: PROFILE_URL,
  updatedAt: new Date().toISOString().slice(0, 10),
  citations: summary
};

if (!DRY_RUN) {
  await writeFile(INDEX_PATH, homepageHtml);
  await writeFile(METRICS_PATH, `${JSON.stringify(nextMetrics, null, 2)}\n`);
}

console.log(JSON.stringify({ ...nextMetrics, countsChanged, dryRun: DRY_RUN }));
