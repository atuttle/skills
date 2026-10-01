# Agent skills

Reusable agent skills by Adam Tuttle.

## Install

```sh
npx skills add atuttle/skills
```

Choose the skills and coding agent when prompted. Install all three lore skills together: they share references and the GitHub helper.

To install all skills globally for Codex:

```sh
npx skills add atuttle/skills --skill '*' --agent codex --global
```

## Skills

| Skill | Purpose |
| --- | --- |
| [Lore](skills/lore/SKILL.md) | Research local product lore for the calling workflow to consider. |
| [Deep Lore](skills/deep-lore/SKILL.md) | Follow recorded sources for explicitly requested deeper research. |
| [Lore drop](skills/lore-drop/SKILL.md) | Capture or update lore from conversations and GitHub PR discussions. |

Lore lives in a project's root `LORE.md`, or in `LORE/` with a root index. GitHub collection, clarification, and reactions require Node.js 20+ and an authenticated [GitHub CLI](https://cli.github.com/).

## License

[MIT](LICENSE).
