import { readFile, writeFile } from 'node:fs/promises';

const PROFILE_ID = 'qV5hX1cAAAAJ';
const PROFILE_URL = `https://scholar.google.com/citations?hl=en&user=${PROFILE_ID}&pagesize=100`;
const SERPAPI_URL = 'https://serpapi.com/search.json';
const SERPAPI_KEY = process.env.SERPAPI_KEY;
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

function normalizeTitle(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchScholarArticles() {
  if (!SERPAPI_KEY) throw new Error('Missing required SERPAPI_KEY environment variable');

  const parameters = new URLSearchParams({
    engine: 'google_scholar_author',
    author_id: PROFILE_ID,
    hl: 'en',
    num: '100',
    api_key: SERPAPI_KEY
  });
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${SERPAPI_URL}?${parameters}`);

      if (!response.ok) throw new Error(`SerpApi returned HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(`SerpApi error: ${payload.error}`);
      if (!Array.isArray(payload.articles)) throw new Error('SerpApi returned no Google Scholar articles');

      return payload.articles;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 5000);
    }
  }

  throw lastError;
}

function extractCitations(articles) {
  const results = new Map();

  for (const article of articles) {
    const title = normalizeTitle(article.title ?? '');
    const count = Number(article.cited_by?.value ?? 0);
    if (title && Number.isFinite(count)) results.set(title, count);
  }

  return results;
}

function replaceCitationCount(html, key, count) {
  const pattern = new RegExp(`(<span data-scholar-citations="${key}">)\\d+(<\\/span>)`);
  if (!pattern.test(html)) throw new Error(`Missing citation target for ${key} in index.html`);
  return html.replace(pattern, (_, opening, closing) => `${opening}${count}${closing}`);
}

const articles = await fetchScholarArticles();
const citationsByTitle = extractCitations(articles);
let homepageHtml = await readFile(INDEX_PATH, 'utf8');
const currentMetrics = JSON.parse(await readFile(METRICS_PATH, 'utf8'));
const summary = {};

for (const paper of papers) {
  const normalizedTitle = normalizeTitle(paper.title);
  if (!citationsByTitle.has(normalizedTitle)) {
    throw new Error(`Paper not found on Google Scholar profile: ${paper.title}`);
  }

  const count = citationsByTitle.get(normalizedTitle);
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
