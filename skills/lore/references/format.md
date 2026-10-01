# Reading project lore

Start at the repository root's `LORE.md`. It either contains entries or indexes Markdown files under `LORE/`. Existing collections may use both, or have only the directory. Search for descriptions, customer names, code paths, and terminology to find relevant entries.

An entry has a descriptive heading, its current explanation, what it applies to, and source/date. For example:

```markdown
## UMD affiliation updates

UMD affiliation values must be changed in the CRM because the nightly import
overwrites platform changes.

**Applies to:** UMD affiliation imports; relevant import script paths.
**Source:** [PR discussion](https://github.com/ORG/REPO/pull/123#issuecomment-456) (2026-10-01).
```

This example explains UMD affiliation imports. It does not establish how another customer's imports behave. Keep customer names, settings, and component names in the answer when they limit the explanation.

An optional `History` section summarizes earlier versions, one sentence each. The main explanation is current; those earlier versions describe what used to be true. Include history when it helps answer the question.

Read labels such as “intentional behavior,” “accepted limitation,” and “known bug” as the author's statements. Return that information for the caller to evaluate. Merely documenting a behavior does not establish that the author accepts it.

Source links identify where the knowledge came from. Do not return them in your reply, and do not follow them for more detail.

The canonical format and writing rules live in [lore-drop's format.md](../../lore-drop/references/format.md). They are used by the writing skill; ordinary local research does not require loading that guide.
