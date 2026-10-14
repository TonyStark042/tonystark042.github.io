const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
const links = [...nav.querySelectorAll('a')];
function closeMenu() {
  nav.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open navigation');
}
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
links.forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
const sections = links.map(link => document.querySelector(link.hash));
let scheduled = false;
function updateActive() {
  let current = sections[0];
  for (const section of sections) if (section.getBoundingClientRect().top <= 150) current = section;
  for (const link of links) {
    const active = link.hash === '#' + current.id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  scheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(updateActive); }
}, { passive: true });
updateActive();

const GITHUB_METRIC_CACHE_TTL = 6 * 60 * 60 * 1000;

function formatCompactMetric(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, '')}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(value);
}

function updateGitHubMetric(link, count, live) {
  const target = link.querySelector('[data-github-stars]');
  if (!target || !Number.isFinite(count)) return;
  target.textContent = formatCompactMetric(count);
  const formatted = count.toLocaleString('en-US');
  link.setAttribute('aria-label', `Code, ${formatted} GitHub stars`);
  link.title = `${formatted} GitHub stars${live ? ' (live)' : ''}`;
  link.dataset.metricState = live ? 'live' : 'cached';
}

function readCachedGitHubMetric(repo) {
  try {
    const cached = JSON.parse(localStorage.getItem(`github-stars:${repo}`));
    if (cached && Date.now() - cached.updatedAt < GITHUB_METRIC_CACHE_TTL) return cached.count;
  } catch (_) {
    return null;
  }
  return null;
}

function cacheGitHubMetric(repo, count) {
  try {
    localStorage.setItem(`github-stars:${repo}`, JSON.stringify({ count, updatedAt: Date.now() }));
  } catch (_) {
    // The live value still renders when storage is unavailable.
  }
}

document.querySelectorAll('[data-github-repo]').forEach(link => {
  const repo = link.dataset.githubRepo;
  const cached = readCachedGitHubMetric(repo);
  if (cached !== null) updateGitHubMetric(link, cached, false);

  fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then(response => {
      if (!response.ok) throw new Error(`GitHub metrics request failed with ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!Number.isFinite(data.stargazers_count)) return;
      updateGitHubMetric(link, data.stargazers_count, true);
      cacheGitHubMetric(repo, data.stargazers_count);
    })
    .catch(() => {
      link.dataset.metricState = cached === null ? 'fallback' : 'cached';
    });
});

const PUBLICATION_METRICS_URL = 'assets/publication-metrics.json';

fetch(PUBLICATION_METRICS_URL, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Publication metrics request failed with ${response.status}`);
    return response.json();
  })
  .then(metrics => {
    document.querySelectorAll('[data-scholar-citations]').forEach(target => {
      const key = target.dataset.scholarCitations;
      const count = Number(metrics.citations?.[key]);
      if (!Number.isFinite(count)) return;

      target.textContent = String(count);
      const link = target.closest('a');
      if (!link) return;
      link.setAttribute('aria-label', `${count.toLocaleString('en-US')} Google Scholar citations`);
      link.dataset.metricState = 'live';
      if (metrics.updatedAt) link.title = `Google Scholar citations · updated ${metrics.updatedAt}`;
    });
  })
  .catch(() => {
    document.querySelectorAll('[data-scholar-citations]').forEach(target => {
      const link = target.closest('a');
      if (link) link.dataset.metricState = 'fallback';
    });
  });

const SITE_VISITS_URL = 'https://shuaizhen.goatcounter.com/counter/TOTAL.json';

fetch(SITE_VISITS_URL, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Site visits request failed with ${response.status}`);
    return response.json();
  })
  .then(({ count }) => {
    const target = document.querySelector('[data-site-visits]');
    const container = document.querySelector('[data-site-visits-container]');
    const formattedCount = String(count ?? '').trim();
    if (!target || !container || !formattedCount) return;

    target.textContent = formattedCount;
    container.hidden = false;
  })
  .catch(() => {
    // Keep the counter hidden when GoatCounter is unavailable or blocked.
  });
