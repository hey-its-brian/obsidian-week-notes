# Week Notes

An Obsidian plugin that generates a weekly folder containing daily notes and a weekly roundup, from configurable templates. Replaces shell-script-based daily note workflows with a native, customizable plugin.

## Features

- **Generate a full week at once**: a folder per week containing one note per enabled weekday plus a weekly roundup.
- **Self-healing weekly roundup**: uses Obsidian wikilinks/embeds (`![[note]]`), so renames update automatically — no Dataview required.
- **Configurable weekdays**: pick which days of the week get a note (e.g., weekdays only).
- **Templates**: optionally point to a daily and weekly template file in the vault. Tokens get substituted at generation time.
- **Custom frontmatter**: define key/value frontmatter for daily and weekly notes independently, with token support.
- **Custom folder + filename templates**: arrange the folder structure however you want.
- **ISO or US week numbering**, configurable week start (Monday/Sunday).
- **Auto-generate on startup** (optional) and **open today's note on launch** (optional).
- **Commands**:
  - Generate current week's notes
  - Generate next week's notes
  - Generate notes for a specific date's week
  - Open today's note (creates the week if needed)

## Tokens

Available in templates, filenames, folder paths, and frontmatter values:

| Token | Example |
|---|---|
| `{date}` | `20260413` |
| `{isoDate}` | `2026-04-13` |
| `{weekday}` | `Monday` |
| `{weekdayShort}` | `Mon` |
| `{week}` | `16` |
| `{weekPadded}` | `16` |
| `{year}` | `2026` |
| `{month}` | `04` |
| `{day}` | `13` |

## Default layout

With defaults, generating week 16 of 2026 produces:

```
1-note/
  Week 16/
    _Week 16.md
    20260413 - Monday.md
    20260414 - Tuesday.md
    20260415 - Wednesday.md
    20260416 - Thursday.md
    20260417 - Friday.md
```

The weekly note's body is a list of embeds:

```markdown
## 2026-04-13 - Monday
![[20260413 - Monday]]

## 2026-04-14 - Tuesday
![[20260414 - Tuesday]]
...
```

## Install (manual)

1. Build:
   ```bash
   npm install
   npm run build
   ```
2. Copy `manifest.json` and `main.js` into `<your-vault>/.obsidian/plugins/week-notes/`.
3. Reload Obsidian and enable **Week Notes** in Settings → Community plugins.

## Develop

```bash
npm install
npm run dev
```

This watches `main.ts` and rebuilds `main.js` in place. Symlink the plugin folder into your test vault's `.obsidian/plugins/` directory to iterate.

## License

MIT
