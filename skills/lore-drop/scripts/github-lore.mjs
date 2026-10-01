#!/usr/bin/env node
// Read-only collection and explicit GitHub clarification/reaction commands.
// No package dependencies; gh receives argument arrays and JSON on stdin.

/*
## API references

- [List pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests) and [merged-date search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-when-a-pull-request-was-merged).
- [Search limits](https://docs.github.com/en/rest/search/search#about-search) and [pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).
- [Conversation comments](https://docs.github.com/en/rest/issues/comments), [inline review comments/replies](https://docs.github.com/en/rest/pulls/comments), and [review summaries](https://docs.github.com/en/rest/pulls/reviews).
- [Native REST reactions](https://docs.github.com/en/rest/reactions/reactions), [review objects](https://docs.github.com/en/graphql/reference/pulls#pullrequestreview), and [GraphQL reactions](https://docs.github.com/en/graphql/reference/reactions).
*/

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHORT_RE = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9][0-9]*)$/;
const SOURCE_RE = /^(discussion_r|issuecomment-|pullrequestreview-|r)([1-9][0-9]*)$/;
const REQUEST_RE = /^For \[this lore drop\]\((https:\/\/github\.com\/[^\s)]+)\), I don't have enough information to record a useful entry\./;
const DAY_MS = 24 * 60 * 60 * 1000;

export class LoreError extends Error {
  constructor(message) { super(message); this.name = 'LoreError'; }
}

export function validateRepo(value) {
  if (!REPO_RE.test(value) || value.split('/').some(part => part === '.' || part === '..')) {
    throw new LoreError('Repository must be <org>/<repo>, for example Acme/widgets.');
  }
  return value;
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new LoreError('PR and comment numbers must be positive safe integers.');
  return number;
}

export function parseTarget(value, repo) {
  const short = value.match(SHORT_RE);
  let result;
  if (short) {
    result = { repo: validateRepo(short[1]), number: positiveInteger(short[2]), kind: 'pr' };
  } else {
    let parsed;
    try { parsed = new URL(value); } catch {
      throw new LoreError('Use a github.com PR/comment URL or <org>/<repo>#<number>.');
    }
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parsed.protocol !== 'https:' || parsed.host !== 'github.com' || parsed.username || parsed.password
        || parts.length < 4 || parts[2] !== 'pull' || !/^[1-9][0-9]*$/.test(parts[3])) {
      throw new LoreError('Use a github.com PR/comment URL or <org>/<repo>#<number>.');
    }
    result = { repo: validateRepo(parts.slice(0, 2).join('/')), number: positiveInteger(parts[3]), kind: 'pr' };
    if (parsed.hash) {
      const source = parsed.hash.slice(1).match(SOURCE_RE);
      if (!source) throw new LoreError("Unsupported comment anchor; use the comment's permalink or the PR URL.");
      result.kind = { discussion_r: 'review_comment', r: 'review_comment', 'issuecomment-': 'issue_comment', 'pullrequestreview-': 'review' }[source[1]];
      result.id = positiveInteger(source[2]);
    }
  }
  if (repo && result.repo.toLowerCase() !== validateRepo(repo).toLowerCase()) throw new LoreError('Target and --repo identify different repositories.');
  return result;
}

export function utcText(value) { return new Date(value).toISOString().replace('.000Z', 'Z'); }

function dateFormatter(zone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function calendarDate(value, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

function checkedDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')
      || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new LoreError('--date must be a valid YYYY-MM-DD calendar date.');
  }
  return parsed;
}

function startOfDay(day, formatter) {
  // Resolve the calendar boundary using that date's zone offset, including DST.
  // A clock jump past midnight may make the first local time of the day 01:00.
  const midnight = checkedDate(day).getTime();
  let low = Math.floor((midnight - 2 * DAY_MS) / 1000);
  let high = Math.floor((midnight + 2 * DAY_MS) / 1000);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calendarDate(new Date(middle * 1000), formatter) < day) low = middle + 1;
    else high = middle;
  }
  const result = new Date(low * 1000);
  if (calendarDate(result, formatter) !== day) throw new LoreError(`Calendar date ${day} does not exist in the selected time zone.`);
  return result;
}

export function mergedWindow(days = 1, anchor, zone, now = new Date()) {
  if (!Number.isSafeInteger(days) || days < 1) throw new LoreError('--days must be a positive integer.');
  const formatter = dateFormatter(zone);
  const endDay = anchor ?? calendarDate(now, formatter);
  const shifted = new Date(checkedDate(endDay).getTime() - days * DAY_MS);
  if (!Number.isFinite(shifted.getTime())) throw new LoreError('Selected calendar range is too large.');
  return [startOfDay(shifted.toISOString().slice(0, 10), formatter), new Date(startOfDay(endDay, formatter).getTime() - 1000)];
}

export class GitHub {
  constructor(run = execFileSync) { this.run = run; }

  request(endpoint, { method = 'GET', params = {}, payload } = {}) {
    const args = ['api', '--method', method, endpoint];
    if (endpoint !== 'graphql') args.push('-H', 'Accept: application/vnd.github+json');
    for (const [key, value] of Object.entries(params)) args.push('-f', `${key}=${value}`);
    if (payload !== undefined) args.push('--input', '-');
    let output;
    try {
      output = this.run('gh', args, {
        encoding: 'utf8', input: payload === undefined ? undefined : JSON.stringify(payload),
        timeout: 60_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (error.code === 'ENOENT') throw new LoreError('gh CLI is not installed.');
      if (error.code === 'ETIMEDOUT') throw new LoreError(`GitHub request timed out: ${method} ${endpoint}`);
      throw new LoreError(`GitHub request failed: ${method} ${endpoint}: ${String(error.stderr ?? error.message).trim()}`);
    }
    let data;
    try { data = output.trim() ? JSON.parse(output) : null; } catch { throw new LoreError(`GitHub returned invalid JSON for ${endpoint}.`); }
    if (data?.errors?.length) throw new LoreError(`GitHub returned GraphQL errors: ${JSON.stringify(data.errors)}`);
    return data;
  }

  pages(endpoint, params = {}) {
    const rows = [];
    for (let page = 1; ; page++) {
      const batch = this.request(endpoint, { params: { ...params, per_page: 100, page } });
      if (!Array.isArray(batch)) throw new LoreError(`Expected an array from ${endpoint}.`);
      rows.push(...batch);
      if (batch.length < 100) return rows;
    }
  }
}

export function mergedPRs(api, repo, start, end, budget = { remaining: 64 }) {
  if (budget.remaining-- <= 0) throw new LoreError('Complete merged-date search exceeded 64 split queries; use a shorter period or explicit PR targets.');
  const query = `repo:${repo} is:pr is:merged merged:${utcText(start)}..${utcText(end)}`;
  const params = { q: query, per_page: 100, page: 1 };
  const first = api.request('search/issues', { params });
  if (!Number.isSafeInteger(first?.total_count) || first.total_count < 0 || !Array.isArray(first.items)) throw new LoreError('Invalid PR search response.');
  const count = first.total_count;
  if (count > 1000 || first.incomplete_results) {
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 1) throw new LoreError('Merged PR search is incomplete even for a one-second interval; scan aborted.');
    const midpoint = new Date(start.getTime() + Math.floor(seconds / 2) * 1000);
    return [...mergedPRs(api, repo, start, midpoint, budget), ...mergedPRs(api, repo, new Date(midpoint.getTime() + 1000), end, budget)];
  }
  const rows = [...first.items];
  for (let page = 2; page <= Math.ceil(count / 100); page++) {
    const result = api.request('search/issues', { params: { ...params, page } });
    if (result.incomplete_results || result.total_count !== count || !Array.isArray(result.items)) {
      throw new LoreError('PR search changed or became incomplete during pagination; rerun the bounded scan.');
    }
    rows.push(...result.items);
  }
  if (rows.length !== count) throw new LoreError('PR search returned fewer results than its total; scan aborted.');
  return rows;
}

export function isLore(body = '') {
  let fence;
  const visible = [];
  for (const line of body.split(/\r?\n/)) {
    const stripped = line.trimStart();
    const fenced = stripped.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (fenced && fenced[1][0] === fence[0] && fenced[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fenced) { fence = fenced[1]; continue; }
    if (!stripped.startsWith('>')) visible.push(line);
  }
  return /(?<![A-Za-z0-9_])LORE:/.test(visible.join('\n'));
}

function normalized(kind, raw, repo, number) {
  const anchor = { issue_comment: 'issuecomment-', review_comment: 'discussion_r', review: 'pullrequestreview-' }[kind];
  const item = {
    kind, id: raw.id, node_id: raw.node_id ?? null,
    url: raw.html_url ?? `https://github.com/${repo}/pull/${number}#${anchor}${raw.id}`,
    author: raw.user?.login ?? null, body: raw.body ?? '',
    created_at: raw.created_at ?? raw.submitted_at ?? null, updated_at: raw.updated_at ?? raw.submitted_at ?? null,
  };
  const target = parseTarget(item.url);
  if (target.repo.toLowerCase() !== repo.toLowerCase() || target.number !== number) throw new LoreError('Source permalink does not belong to the requested PR.');
  if (kind === 'review_comment') Object.assign(item, { in_reply_to_id: raw.in_reply_to_id ?? null, path: raw.path ?? null, diff_hunk: raw.diff_hunk ?? null });
  return item;
}

export function allSources(pr) { return [...pr.conversation, ...pr.reviews, ...pr.inline]; }

export function threadFor(pr, source) {
  if (source.kind === 'review_comment') {
    const root = source.in_reply_to_id ?? source.id;
    return pr.inline.filter(item => item.id === root || item.in_reply_to_id === root);
  }
  return [...pr.conversation, ...pr.reviews].sort((a, b) => {
    const left = `${a.created_at ?? ''}|${a.url}`, right = `${b.created_at ?? ''}|${b.url}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function clarificationSource(body = '') { return body.match(REQUEST_RE)?.[1] ?? null; }

export function sourceURLs(text = '') {
  const urls = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!/^\*\*Source:\*\*\s*/.test(line)) continue;
    for (const [, url] of line.matchAll(/\[[^\]]*\]\((https:\/\/github\.com\/[^\s)]+)\)/g)) {
      try {
        if (parseTarget(url).kind !== 'pr') urls.add(url);
      } catch { /* Other source links are not GitHub PR comments. */ }
    }
  }
  return [...urls];
}

export function fetchPR(api, repo, number, raw) {
  const root = `repos/${repo}`;
  raw ??= api.request(`${root}/pulls/${number}`);
  if (raw.number !== number || !raw.head) throw new LoreError('Target is not a pull request.');
  const pr = {
    number, url: raw.html_url, state: raw.state, merged_at: raw.merged_at ?? null, head_ref: raw.head.ref,
    context: { title: raw.title ?? null, body: raw.body ?? '', files: [] },
    conversation: api.pages(`${root}/issues/${number}/comments`).map(row => normalized('issue_comment', row, repo, number)),
    inline: api.pages(`${root}/pulls/${number}/comments`).map(row => normalized('review_comment', row, repo, number)),
    reviews: api.pages(`${root}/pulls/${number}/reviews`).filter(row => row.state !== 'PENDING').map(row => normalized('review', row, repo, number)),
  };
  pr.candidates = allSources(pr).filter(item => isLore(item.body)).map(item => item.url);
  if (pr.candidates.length) {
    if (raw.changed_files === undefined) {
      raw = api.request(`${root}/pulls/${number}`);
      Object.assign(pr.context, { title: raw.title ?? null, body: raw.body ?? '' });
    }
    const files = api.pages(`${root}/pulls/${number}/files`);
    if (raw.changed_files !== undefined && files.length !== raw.changed_files) throw new LoreError(`PR #${number} changed-file listing is incomplete; inspect this PR directly.`);
    pr.context.files = files.map(item => item.filename);
  }
  return pr;
}

function makeBundle(api, repo, selected, { target = null, window = null, openRows = [] } = {}) {
  const metadata = api.request(`repos/${repo}`);
  const bundle = { version: 1, repo, default_branch: metadata.default_branch, collected_at: utcText(new Date()), target, merged_window: window, pending_captures: [], prs: [] };
  for (const row of openRows) {
    if (!row.head?.ref?.startsWith('lore-drop/')) continue;
    for (const url of sourceURLs(row.body ?? '')) bundle.pending_captures.push({ url, lore_pr: row.html_url });
  }
  for (const [number, raw] of [...selected].sort(([a], [b]) => a - b)) {
    const pr = fetchPR(api, repo, number, raw);
    if (target && target.kind !== 'pr' && number === target.number && !allSources(pr).some(item => item.kind === target.kind && item.id === target.id)) {
      throw new LoreError('Referenced comment/review was not found on that PR (deleted or inaccessible).');
    }
    if (pr.candidates.length || target) bundle.prs.push(pr);
  }
  return bundle;
}

export function scan(api, repo, { days = 1, anchor, zone } = {}) {
  validateRepo(repo);
  const [start, end] = mergedWindow(days, anchor, zone);
  const opened = api.pages(`repos/${repo}/pulls`, { state: 'open' });
  const selected = new Map(opened.map(row => [row.number, row]));
  for (const row of mergedPRs(api, repo, start, end)) if (!selected.has(row.number)) selected.set(row.number, undefined);
  return makeBundle(api, repo, selected, { window: { start: utcText(start), end: utcText(end), timezone: zone ?? 'system-local' }, openRows: opened });
}

export function fetch(api, value, repo) {
  const target = parseTarget(value, repo);
  const opened = api.pages(`repos/${target.repo}/pulls`, { state: 'open' });
  return makeBundle(api, target.repo, new Map([[target.number, undefined]]), { target, openRows: opened });
}

export function locate(bundle, sourceURL) {
  const target = parseTarget(sourceURL, bundle.repo);
  if (target.kind === 'pr') throw new LoreError('--source must identify a comment or review, not just a PR.');
  for (const pr of bundle.prs) {
    if (pr.number !== target.number) continue;
    const source = allSources(pr).find(item => item.id === target.id && item.kind === target.kind);
    if (source) return [pr, source];
  }
  throw new LoreError('Source is absent from the collected bundle.');
}

export function inventory(bundle) {
  const sources = [];
  let selectedComment = null;
  for (const pr of bundle.prs) {
    for (const source of allSources(pr)) {
      if (bundle.target?.number === pr.number && source.kind === bundle.target.kind && source.id === bundle.target.id) selectedComment = source.url;
    }
    for (const url of pr.candidates) {
      const [, source] = locate(bundle, url);
      const pending = bundle.pending_captures.filter(item => item.url === url).map(item => item.lore_pr);
      sources.push({ pr: pr.number, url, author: source.author, pending_lore_prs: pending });
    }
  }
  return { repo: bundle.repo, target: bundle.target, selected_comment: selectedComment, merged_window: bundle.merged_window, sources };
}

export function show(bundle, sourceURL) {
  const [pr, source] = locate(bundle, sourceURL);
  return { repo: bundle.repo, pr: pr.number, context: pr.context, source, discussion: threadFor(pr, source), pending_captures: bundle.pending_captures.filter(item => item.url === source.url) };
}

function refreshed(api, bundle, sourceURL) {
  const [oldPR, oldSource] = locate(bundle, sourceURL);
  const pr = fetchPR(api, bundle.repo, oldPR.number);
  const source = allSources(pr).find(item => item.id === oldSource.id && item.kind === oldSource.kind);
  if (!source) throw new LoreError('Original source was deleted or became inaccessible; no mutation performed.');
  return [pr, source];
}

function clarificationContext(pr, source, contextURLs) {
  const evidence = new Map([[source.url, source]]);
  if (source.kind === 'review_comment') {
    const root = source.in_reply_to_id ?? source.id;
    const item = pr.inline.find(comment => comment.id === root);
    if (item) evidence.set(item.url, item);
  }
  for (const url of contextURLs) {
    const item = allSources(pr).find(comment => comment.url === url);
    if (!item || clarificationSource(item.body)) throw new LoreError('--context-url must identify relevant human context from the same PR.');
    evidence.set(url, item);
  }
  return [...evidence.values()];
}

export function clarify(api, bundle, sourceURL, questions, { contextURLs = [], dryRun = false } = {}) {
  questions = questions.trim();
  if (!questions) throw new LoreError('Clarification questions must not be empty.');
  const [pr, source] = refreshed(api, bundle, sourceURL);
  if (!isLore(source.body)) throw new LoreError('--source must be the original LORE: message, not a clarification reply.');
  const context = clarificationContext(pr, source, contextURLs);
  const prior = allSources(pr).filter(item => clarificationSource(item.body) === source.url)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')).at(-1);
  if (prior && !context.some(item => Date.parse(item.created_at) > Date.parse(prior.created_at))) {
    return { status: 'already_asked', source: source.url, clarification: prior.url };
  }
  const body = `For [this lore drop](${source.url}), I don't have enough information to record a useful entry.\n\n${questions}`;
  const endpoint = source.kind === 'review_comment'
    ? `repos/${bundle.repo}/pulls/${pr.number}/comments/${source.in_reply_to_id ?? source.id}/replies`
    : `repos/${bundle.repo}/issues/${pr.number}/comments`;
  if (dryRun) return { status: 'preview', endpoint, body };
  const reply = api.request(endpoint, { method: 'POST', payload: { body } });
  return { status: 'asked', source: source.url, clarification: reply.html_url };
}

export function react(api, bundle, sourceURL, lorePRURL, { dryRun = false } = {}) {
  const target = parseTarget(lorePRURL, bundle.repo);
  if (target.kind !== 'pr') throw new LoreError('--lore-pr must identify the published capture PR.');
  const published = api.request(`repos/${bundle.repo}/pulls/${target.number}`);
  if (published.state !== 'open' && !published.merged_at) throw new LoreError('Capture PR is closed without being merged; acknowledgment not performed.');
  const [, original] = locate(bundle, sourceURL);
  if (!sourceURLs(published.body ?? '').includes(original.url)) {
    throw new LoreError('Capture PR does not list this source; publish its lore entry and visible Source link first.');
  }
  const [pr, source] = refreshed(api, bundle, sourceURL);
  if (!isLore(source.body)) throw new LoreError('React to the original LORE: message, not a follow-up.');
  let endpoint, payload;
  if (source.kind === 'review') {
    if (!source.node_id) throw new LoreError('Review node ID is unavailable; native reaction cannot be added.');
    endpoint = 'graphql';
    payload = { query: 'mutation($subject:ID!){addReaction(input:{subjectId:$subject,content:EYES}){reaction{content}}}', variables: { subject: source.node_id } };
  } else {
    const segment = source.kind === 'issue_comment' ? 'issues' : 'pulls';
    endpoint = `repos/${bundle.repo}/${segment}/comments/${source.id}/reactions`;
    payload = { content: 'eyes' };
  }
  if (dryRun) return { status: 'preview', endpoint, payload, source: source.url };
  api.request(endpoint, { method: 'POST', payload });
  return { status: 'acknowledged', source: source.url, lore_pr: lorePRURL, reaction: 'eyes' };
}

const HELP = `Usage: node github-lore.mjs <command> [options]

Read-only commands:
  scan --repo ORG/REPO --output FILE [--days N] [--date YYYY-MM-DD] [--timezone ZONE]
  fetch <PR/comment URL or ORG/REPO#NUMBER> --output FILE [--repo ORG/REPO]
  show FILE --source COMMENT_URL

Explicit GitHub mutations (both support --dry-run):
  clarify FILE --source URL --body-file FILE [--context-url URL ...]
  react FILE --source URL --lore-pr PR_URL
`;

function optionsFor(command) {
  const string = { type: 'string' }, dryRun = { 'dry-run': { type: 'boolean', default: false } };
  switch (command) {
    case 'scan': return { repo: string, output: string, days: string, date: string, timezone: string };
    case 'fetch': return { repo: string, output: string };
    case 'show': return { source: string };
    case 'clarify': return { source: string, 'body-file': string, 'context-url': { type: 'string', multiple: true, default: [] }, ...dryRun };
    case 'react': return { source: string, 'lore-pr': string, ...dryRun };
    default: throw new LoreError(`Unknown command: ${command}`);
  }
}

function required(values, key) {
  if (!values[key]) throw new LoreError(`--${key} is required.`);
  return values[key];
}

function readBundle(path) {
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  if (bundle.version !== 1) throw new LoreError('Unsupported bundle version.');
  validateRepo(bundle.repo);
  return bundle;
}

export function main(argv = process.argv.slice(2), { api = new GitHub(), stdout = process.stdout, stderr = process.stderr } = {}) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { stdout.write(HELP); return 0; }
  try {
    const command = argv[0];
    const { values, positionals } = parseArgs({ args: argv.slice(1), options: optionsFor(command), allowPositionals: true, strict: true });
    if (positionals.length !== (command === 'scan' ? 0 : 1)) throw new LoreError('Unexpected or missing positional arguments; use --help.');
    let output;
    if (command === 'scan' || command === 'fetch') {
      const path = required(values, 'output');
      const bundle = command === 'scan'
        ? scan(api, required(values, 'repo'), { days: values.days === undefined ? 1 : Number(values.days), anchor: values.date, zone: values.timezone })
        : fetch(api, positionals[0], values.repo);
      // Failed collection does not publish a partial bundle.
      writeFileSync(path, JSON.stringify(bundle, null, 2) + '\n');
      output = { bundle: path, ...inventory(bundle) };
    } else {
      const bundle = readBundle(positionals[0]), source = required(values, 'source');
      switch (command) {
        case 'show': output = show(bundle, source); break;
        case 'clarify': output = clarify(api, bundle, source, readFileSync(required(values, 'body-file'), 'utf8'), { contextURLs: values['context-url'], dryRun: values['dry-run'] }); break;
        case 'react': output = react(api, bundle, source, required(values, 'lore-pr'), { dryRun: values['dry-run'] }); break;
      }
    }
    stdout.write(JSON.stringify(output, null, 2) + '\n');
    return 0;
  } catch (error) {
    stderr.write(`lore-drop: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
