# Docs content — how this folder works

This folder holds every doc page's markdown source. **A file existing here does not make it live.** The sidebar, search index, and page routes are all driven by one file: [`nav.ts`](./nav.ts). A markdown file with no entry in `nav.ts` renders nowhere — visiting its URL directly returns a normal 404.

## Publishing a reviewed doc (the common case)

1. Place the finished markdown at `content/docs/<category>/<name>.md` (lowercase, hyphenated — this path becomes both the file's identity and its URL).
2. Open `nav.ts` and add one entry to the right category's `docs` array:
   ```ts
   { title: "Pants", slug: "garments/pants", order: 2, description: "..." }
   ```
   `slug` must exactly match the file path minus `.md`.
3. Done. No build step, no restart required in dev — the app reads `nav.ts` and the markdown file at request time.

## Writing a doc that isn't ready yet

Just drop the `.md` file in the right folder and stop — do not touch `nav.ts`. It's fully safe to leave unfinished or unreviewed drafts sitting here; nothing will surface them.

## Un-publishing

Delete (or comment out) the doc's entry in `nav.ts`. The `.md` file itself is untouched and can be re-published later by re-adding the entry.

## Markdown features supported

- Standard GFM: tables, strikethrough, task lists, autolinks (`remark-gfm`).
- Syntax-highlighted code fences, language-tagged: ` ```ts `, ` ```python `, etc. (`rehype-pretty-code`, Shiki-based).
- Images: standard `![alt](path)` — use an absolute path under `/public` or a full URL.
- Callout boxes, via directive syntax (`remark-directive`):
  ```md
  :::note
  A neutral, informational aside.
  :::

  :::warning
  Something the reader needs to be careful about.
  :::

  :::tip
  An optional-but-helpful suggestion.
  :::
  ```
- Headings (`##`/`###`) automatically get stable, slugged ids and populate the right-hand "on this page" navigation — no manual anchors needed.

## File naming

Use the same slug in the filename and in `nav.ts`'s `slug` field, always relative to `content/docs/`. Category folders (`garments/`, and whatever gets added later) are just organization for this filesystem — the actual category grouping shown in the sidebar comes from `nav.ts`'s structure, not the folder layout, so nesting docs into subfolders is a convenience, not a requirement.
