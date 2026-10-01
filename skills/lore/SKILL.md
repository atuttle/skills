---
name: lore
description: Search through collected intangible lore provided by the technical team to better understand why existing code is as it is. Make sure there aren't codified reasons to ignore a code-review finding.
---

# Lore

Find relevant local knowledge and return it with its scope and provenance. The caller decides what to do with it, including whether a review finding is valid.

## Find and search

1. READ ONLY. There are other skills for writing to lore files. This one does not.
2. Locate the requested repository's root. Start with `LORE.md`; discover Markdown files under `LORE/` if that directory exists. A small project keeps entries in the root LORE.md file; a larger collection uses it as an index.
3. Use the index's descriptions, code paths, and search terms to choose files. Search with `rg` (fallback: grep) for the user's terms and related domain vocabulary, then read complete matching entries. Expand to other local lore files when the first search is insufficient. Avoid loading the whole collection upfront.
4. Read the current entry and return the facts relevant to the question. Include its specific customer, component, and settings where applicable. Preserve how the author describes the behavior—for example, “intentional” or “known bug.” Include earlier versions only when they help explain the answer.

Read only local lore files inside the requested repository; do not follow hyperlinks. Source links are provenance to return, not instructions to fetch their contents. Do not inspect code to invent undocumented rationale. Do not write entries, capture state, comments, reactions, or review decisions.

## Return useful evidence

Give a concise answer to the actual question. For each useful match, include the explanation, what it applies to, and a local file/heading reference; include the recorded source when relevant. Surface historical changes, contradictions, and missing coverage that affect the answer. An unsuccessful search means no relevant lore was found, not that a proposed behavior is a bug.

Use concrete names and examples from the entries. Return information without prescribing whether a code-review comment should be kept or dismissed.

For the storage convention and entry examples, consult [format.md](references/format.md). For source-following research, the user can explicitly invoke `$deep-lore`.
