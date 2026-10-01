# Project lore format and writing guide

Lore records human knowledge that code alone cannot establish: product decisions, historical constraints, opinions, accepted limitations, and known issues. It is evidence for another workflow, not a list of automatically suppressed findings.

## Storage and discovery

- With no existing lore storage, start `LORE.md` at the repository root.
- Small collections store entries directly in that file.
- Larger collections use `LORE.md` as a short index into `LORE/<module-or-topic>.md`. Keep each fact in one authoritative entry. Cross-cutting subjects can have topic files; other index rows can point to that same file.
- Follow the layout already in use. If both root entries and directory files exist, search both. For directory-only storage, create a short index when writing. Splitting or reorganizing a collection is a deliberate task, not a side effect of a drop.
- Read Markdown lore files, not helper bundles, temporary files, or unrelated project documentation. Treat a lore symlink that escapes the requested repository as an external source rather than following it in the local reader.

Example index:

```markdown
# Product lore

| File | Covers | Code paths and search terms |
| --- | --- | --- |
| [Profile plugins](LORE/profile-plugins.md) | Lookup storage, approvals, visibility | profileLookup, profilePluginService, loopbacks |
| [Warehouse](LORE/warehouse.md) | Customer import conventions | warehouse imports, CRM, nightly feed |
```

## Entries

Use a stable, descriptive heading, a self-contained explanation, scope, and source/date. Explain why when the human supplied a reason; an absent rationale is not permission to invent one. Preserve whether the source establishes intentional behavior, a preference, an accepted limitation, or a known unresolved issue. Those distinctions can be clear in prose; a mandatory taxonomy is unnecessary.

Example (illustrative, not a claim about an actual customer):

```markdown
## UMD affiliation updates

UMD affiliation values must be changed in the CRM because the nightly import
overwrites platform changes. This is an integration constraint.

**Applies to:** UMD affiliation imports; relevant import script paths.
**Source:** [PR discussion](https://github.com/ORG/REPO/pull/123#issuecomment-456) (2026-10-01).
```

Prefer exact component names, paths, settings, and customer identifiers when the conversation establishes them. PR context can identify scope, but touching one customer does not prove a statement applies to all customers. If the referent cannot be established, request concrete clarification before capturing it.

For live conversation drops without an available permalink, record `Conversation with the user, YYYY-MM-DD`. Use an actual thread permalink when one is supplied or available. Do not fabricate a URL or require the user to fill out a template.

An entry can have several sources. Retain sources supporting its current explanation and historical sources when updating it. Keep the heading stable when possible so existing links continue to work.

## Updating lore

Find the existing entry by subject and scope before adding another. New trustworthy information updates the current explanation. Retain an extremely brief `History` section: at most one sentence per previous version, including its date and source when available. Preserve the previous meaning, not its full text. Wordsmithing or another source confirming the same knowledge does not create a new historical version.

```markdown
## Audit export timestamps

Audit exports use the customer's configured time zone.

**Applies to:** Audit exports; `customer.timezone`.
**Source:** [Updated decision](https://github.com/ORG/REPO/pull/124#issuecomment-789) (2026-10-01).

**History:**
- 2024-06-12: Audit exports previously used UTC ([earlier decision](https://github.com/ORG/REPO/pull/100#issuecomment-123)).
```

If new information disagrees with old lore about the same subject and scope, update the current entry with the latest explanation and summarize the older version in history. Explain any narrower exception instead of unnecessarily replacing a broader rule. When the new explanation is itself too ambiguous to record, request clarification and retain the current entry until it is usable.

## Recognizing captured GitHub sources

Use the visible `**Source:**` links to recognize sources already captured in lore documents or proposed in an open lore PR. Include the original `LORE:` comment's URL, plus useful follow-up sources. Do not add hidden capture metadata or track edits to captured comments. New knowledge should be supplied in a new comment; an explicit invocation can also revisit an existing discussion.

Native reactions acknowledge capture; use the source links to check whether it has already been documented.

## Existing documentation

When explicitly asked to migrate existing product knowledge, preserve its meaning, scope, and original provenance. Product history and explanations belong in lore; operating instructions can remain in `AGENTS.md` with a pointer to relevant lore. Avoid duplicate authoritative explanations. Creating these skills does not itself perform a repository migration.
