# GitHub lore capture

Resolve the helper relative to this skill's directory: `scripts/github-lore.mjs`. It uses Node.js 20+ built-in modules and an authenticated `gh` CLI. There are no package dependencies. Its default commands are read-only; `clarify` and `react` are explicit mutations. Dependencies or access failures should be reported, not bypassed by broad scans.

## Collect within the requested scope

Examples (replace `<PATH>` with the actual skill directory):

```sh
node <PATH>/scripts/github-lore.mjs scan --repo ORG/REPO --days 1 --timezone America/New_York --output /path/to/bundle.json
node <PATH>/scripts/github-lore.mjs fetch ORG/REPO#11111 --output /path/to/bundle.json
node <PATH>/scripts/github-lore.mjs fetch 'https://github.com/ORG/REPO/pull/11111#discussion_r123' --output /path/to/bundle.json
node <PATH>/scripts/github-lore.mjs show /path/to/bundle.json --source 'https://github.com/ORG/REPO/pull/11111#discussion_r123'
```

Store bundles and question drafts in an allowed temporary location, separate from the lore documents and PR diff. The helper prints a compact inventory and saves full conversations in the bundle, so inspect one source at a time instead of dumping every open PR into context. PR bundles contain title/body, changed paths, timeline comments, review summaries, and inline threads. A `LORE:` marker identifies a candidate; determine whether the author is supplying actual knowledge, rather than quoting an example.

`scan` fetches all open PRs, then searches only the chosen merged-date range. Its pagination handles all selected PR comments/reviews. Oversized or incomplete search results are split into smaller intervals within that same range; an unsplittable/incomplete result fails visibly. Do not widen the search to old closed PRs merely because their comments changed. A six-month-old merged PR is accessible through an explicit target, not through this scan.

`--days N` selects the previous N complete calendar days. `--date YYYY-MM-DD` anchors the end to midnight on that date; `--timezone` applies IANA-zone calendar boundaries, including daylight saving changes. Without a timezone argument the helper uses the system's local calendar. For deterministic scheduled runs, supply the timezone explicitly.

PR URLs and `<org>/<repo>#<number>` inspect the whole specified PR. A comment URL focuses on its discussion; the rest of that PR is contextual evidence, not permission to capture unrelated drops. If a supplied clarification URL has no marker, locate its original drop using the thread, explicit links/quotes, and concrete context; ask when the referent remains ambiguous.

## Complete the clarification loop

Read the original finding, the `LORE:` response, and relevant follow-ups together. Human clarification does not need another keyword. Use code paths/diff context to establish scope, without inventing intent from code.

Before any GitHub mutation, apply the repository's authorship requirements and any available mandatory GitHub-writing skills. Include required attribution in the drafted text. The helper handles API mechanics, not those requirements.

For an insufficient explanation, write a concise question draft to a file and invoke:

```sh
node <PATH>/scripts/github-lore.mjs clarify /path/to/bundle.json --source 'SOURCE_URL' --body-file /path/to/questions.md
```

When evaluating relevant replies, supply their comment/review permalinks using repeated `--context-url URL` options. The helper recognizes its previous requests by their visible link to the original drop. It asks again only when selected human context was posted after its latest request; changing the question wording or editing an old comment does not trigger another request. Evaluate the new reply first: if it is still insufficient, ask no more than 3 fresh specific questions. Unrelated activity is not a reason to ask again. Do not send periodic reminders. `--dry-run` previews the exact reply without posting.

Concrete example: “Does the nightly UMD import overwrite affiliation rows in `TableX`, or only the primary-affiliation column? That determines whether this applies to every affiliation value or just the primary one.” Use terms supported by the actual thread; this example is illustrative.

Inline review comments have native threads; the helper replies to the top-level root even when the drop is itself a reply. General PR timeline comments and review summaries have no native reply-parent relationship: the helper posts a timeline comment linking the original source. Read explicit links/quotes and actual content to associate subsequent clarification; chronological proximity alone is insufficient. Resolved/outdated inline discussions remain eligible for direct capture. Leave code-review resolution to its own workflow.

## Avoid duplicate captures

Search `LORE.md` and `LORE/*.md` for the subject and source URL. The bundle also includes visible `**Source:**` links from currently open lore PRs. Routine scans skip sources already documented or proposed in those PRs. An unresolved clarification remains eligible: asking a question is not a completed capture.

Do not track edits to captured comments. A new `LORE:` comment can update an existing entry; an explicit invocation can revisit an existing discussion. Compare its explanation with the stored lore, rather than creating duplicate entries or history for unchanged knowledge.

If a matching pending PR already contains the current explanation, use that existing capture rather than repeating it. If new information supersedes a pending entry, keep the newer capture self-contained and note the overlap in the new PR; do not silently edit another scan's PR or discard human edits. Each scan creates at most one new lore PR for its repository.

## Publish, then acknowledge

1. Resolve a checkout of the target repository and read its `AGENTS.md`/contribution instructions and PR template. Verify repository identity. Use an isolated branch/worktree based on its current default branch for GitHub capture, preserving unrelated work. Use a `lore-drop/` branch prefix.
2. Write/update only `LORE.md` and lore Markdown files, with visible `**Source:**` links. Include each captured original `LORE:` comment's URL. Update the index when adding a file. Review the diff for unsupported generalizations, invented rationale, duplicate facts, and history longer than one sentence per past version.
3. Build the PR body using the repository's actual template. Preserve reviewer-owned checklists. Include what was captured/updated and any outstanding clarification. Select relevant existing labels under the repository's conventions; don't invent labels or require a particular module label in unrelated repositories.
4. Commit the focused documentation diff, push the branch, and create the PR using structured arguments or `gh pr create --body-file`. All lore-drops must create a PR, so by default this lore PR and its clarification/reaction workflow are authorized. Do not merge it automatically. Apply any available skill/instructions required for GitHub authorship.
5. Only after the documented entries are published in the lore PR, acknowledge each captured original source:

   ```sh
   node <PATH>/scripts/github-lore.mjs react /path/to/bundle.json --source 'SOURCE_URL' --lore-pr 'https://github.com/ORG/REPO/pull/22222'
   ```

   This creates a native `eyes` reaction 👀. Never acknowledge a skipped/uncaptured source as completed. If publication or reaction fails, report the exact partial result; an acknowledgment retry does not need another documentation PR.

Return the lore PR link, captured subjects, and unresolved items briefly. No success comments on the source PR. When a scan has no useful changes, report that and any clarification requests without creating an empty PR.
