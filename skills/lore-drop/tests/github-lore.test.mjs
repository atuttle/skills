import assert from 'node:assert/strict';
import test from 'node:test';
import { closedPRs, closedWindow, GitHub, inventory, scan } from '../scripts/github-lore.mjs';

const repo = 'Acme/widgets';

function pr(number, state, closed_at = null, merged_at = null) {
  return {
    number, state, closed_at, merged_at,
    html_url: `https://github.com/${repo}/pull/${number}`,
    head: { ref: `topic-${number}` }, title: `PR ${number}`, body: '', changed_files: 1,
  };
}

// Apply search qualifiers to fixtures so eligibility depends on the actual query.
function searchResults(prs, query) {
  const [, field, start, end] = query.match(/\b(closed|merged):(\S+)\.\.(\S+)/);
  return prs.filter(row => (!query.includes('is:closed') || row.state === 'closed')
    && (!query.includes('is:merged') || row.merged_at)
    && row[`${field}_at`] >= start && row[`${field}_at`] <= end);
}

class FixtureGitHub extends GitHub {
  constructor(prs) { super(); this.prs = prs; this.fetched = []; }

  request(endpoint, { params = {} } = {}) {
    if (endpoint === `repos/${repo}`) return { default_branch: 'main' };
    if (endpoint === 'search/issues') {
      const matches = searchResults(this.prs, params.q);
      const offset = (params.page - 1) * params.per_page;
      return { total_count: matches.length, incomplete_results: false, items: matches.slice(offset, offset + params.per_page) };
    }
    if (endpoint === `repos/${repo}/pulls`) {
      assert.equal(params.state, 'open');
      return this.prs.filter(row => row.state === 'open');
    }
    const pull = endpoint.match(/\/pulls\/(\d+)$/);
    if (pull) {
      const number = Number(pull[1]);
      this.fetched.push(number);
      return this.prs.find(row => row.number === number);
    }
    const comments = endpoint.match(/\/issues\/(\d+)\/comments$/);
    if (comments) {
      return [{ id: Number(comments[1]) * 10, body: 'LORE: Retries use the original request ID.', user: { login: 'human' } }];
    }
    if (endpoint.endsWith('/files')) return [{ filename: 'src/retries.js' }];
    if (endpoint.endsWith('/comments') || endpoint.endsWith('/reviews')) return [];
    assert.fail(`Unexpected endpoint: ${endpoint}`);
  }
}

test('scan collects open, merged, and closed-unmerged PRs within close-date boundaries', () => {
  const api = new FixtureGitHub([
    pr(1, 'open'),
    pr(2, 'closed', '2026-10-29T04:00:00Z', '2026-10-29T04:00:00Z'),
    pr(3, 'closed', '2026-10-30T03:59:59Z'),
    { ...pr(4, 'closed', '2026-10-29T03:59:59Z'), updated_at: '2026-10-29T12:00:00Z' },
    pr(5, 'closed', '2026-10-30T04:00:00Z'),
  ]);
  const bundle = scan(api, repo, { anchor: '2026-10-30', zone: 'America/New_York' });
  assert.deepEqual(bundle.prs.map(row => row.number), [1, 2, 3]);
  assert.deepEqual(api.fetched, [2, 3]);
  assert.equal(bundle.prs[2].merged_at, null);
  assert.equal(bundle.prs[2].closed_at, '2026-10-30T03:59:59Z');
  assert.equal(bundle.prs[2].candidates.length, 1);
  assert.deepEqual(bundle.closed_window, {
    start: '2026-10-29T04:00:00Z', end: '2026-10-30T03:59:59Z', timezone: 'America/New_York',
  });
  assert.deepEqual(inventory(bundle).closed_window, bundle.closed_window);
});

test('the selected calendar day includes the extra hour when daylight saving ends', () => {
  assert.deepEqual(closedWindow(1, '2026-11-02', 'America/New_York').map(date => date.toISOString()), [
    '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.000Z',
  ]);
});

test('closed PR search collects all pages, including unmerged PRs after the first page', () => {
  const rows = Array.from({ length: 101 }, (_, index) => pr(index + 1, 'closed', '2026-10-29T12:00:00Z'));
  const api = new FixtureGitHub(rows);
  const found = closedPRs(api, repo, new Date('2026-10-29T00:00:00Z'), new Date('2026-10-29T23:59:59Z'));
  assert.deepEqual(found.map(row => row.number), rows.map(row => row.number));
});

test('oversized and incomplete searches split the close-date range without gaps', () => {
  const rows = [pr(1, 'closed', '2026-10-29T00:00:00Z'), pr(2, 'closed', '2026-10-29T00:00:03Z')];
  for (const overflow of [{ total_count: 1001 }, { incomplete_results: true }]) {
    const queries = [];
    const api = {
      request(endpoint, { params }) {
        assert.equal(endpoint, 'search/issues');
        queries.push(params.q);
        if (queries.length === 1) return { total_count: 2, items: [], ...overflow };
        const items = searchResults(rows, params.q);
        return { total_count: items.length, items };
      },
    };
    const found = closedPRs(api, repo, new Date('2026-10-29T00:00:00Z'), new Date('2026-10-29T00:00:03Z'));
    assert.deepEqual(found.map(row => row.number), [1, 2]);
    assert.equal(queries.length, 3);
    assert.match(queries[1], /closed:2026-10-29T00:00:00Z\.\.2026-10-29T00:00:01Z$/);
    assert.match(queries[2], /closed:2026-10-29T00:00:02Z\.\.2026-10-29T00:00:03Z$/);
  }
});

test('an incomplete one-second search fails rather than reporting no findings', () => {
  const api = { request: () => ({ total_count: 1, incomplete_results: true, items: [] }) };
  const instant = new Date('2026-10-29T00:00:00Z');
  assert.throws(() => closedPRs(api, repo, instant, instant), /search is incomplete/);
});

test('searches that change during pagination fail rather than publishing partial results', () => {
  const api = {
    request(endpoint, { params }) {
      return { total_count: params.page === 1 ? 101 : 102, items: [] };
    },
  };
  assert.throws(() => closedPRs(api, repo, new Date('2026-10-29T00:00:00Z'), new Date('2026-10-29T23:59:59Z')), /changed or became incomplete/);
});
