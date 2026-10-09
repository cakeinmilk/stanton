# Stanton

A lightweight meeting-notes app for Windows. It works like OneNote without the extra weight, and you can dock it to the side of your screen.

<img src="docs/screenshot-page.png" width="640" alt="Page view"> <img src="docs/screenshot-docked.png" width="200" alt="Docked view">

## Features

- **Projects → Pages → Meetings & Notes.** Each page lists its meetings and notes by date, newest or oldest first. A meeting's title has its date in front of it.
- **Action points.** Click the ☆ to the left of any bullet, or press `Ctrl+Shift+A`, to star it as an action point. The shortcut also works on a plain line, which becomes a starred bullet, and on several selected bullets at once. A **whole meeting or note** can be an action point too: click the ⚑ flag in its header, or press `Ctrl+Shift+A` in its title.
  - Open action points are pinned to the top of their **project**.
  - The **Home** page collects open action points from every project, grouped by project or as one list.
  - Tick the circle to mark an action point done (`Ctrl+Shift+D` inside the editor). It drops off the pinned lists but stays in the original meeting, struck through. "Recently completed" on Home lets you undo.
  - Click an action point to jump to the meeting it came from.
- **Rich notes.** Bold, italic, underline, headings, bullet and numbered lists, checklists and links. You can paste or drag in images and resize them. Pasted HTML from web pages and Office keeps its formatting.
- **Dock to the screen edge.** Use the ⇤ / ⇥ buttons in the title bar. On Windows, Stanton registers as a shell *AppBar* (the same mechanism the taskbar uses), so maximised windows fit beside it. Drag its inner edge to resize it. In the narrow docked layout, the project and page drop-downs and the ☰ drawer let you move between projects and pages.
- **Organise by drag and drop.** Drag projects up or down in the sidebar. Drag pages to reorder them, either in the sidebar or on the project page. To move a page to another project, drop it on that project; Stanton asks you to confirm first. The ⋯ and right-click menus also have Move up and Move down.
- **Right-click menus.** Right-click a project or page header, a sidebar row or a meeting/note header to get the same options as its ⋯ menu. In text, right-click gives Cut/Copy/Paste and spelling suggestions.
- **Pinned notes.** Pin any meeting or note from its ⋯ or right-click menu. It appears as a chip at the top of its own page and of the project page; click it to jump there. Right-click a chip to give it an emoji or unpin it.
- **Important dates** for each project (deadlines, launches, key meetings) appear above its action points. Home shows a **Coming up** list for the next three weeks.
- **Home** can list projects as cards or as a compact list.
- **Backup & export.** Export everything (Settings) or a single project (its menu). There are three formats: a **Stanton backup** you can re-import, with images included; a **web page** to open in or paste into Word, OneNote or email; and **Markdown** for apps such as Obsidian or Notion. Importing a backup adds its projects alongside your existing ones.
- **Minimise to the system tray** (on by default; you can turn it off in Settings). While Stanton is hidden, its docked strip of screen is released for other windows.
- **Archive or delete** projects and pages from their ⋯ menus. Archived items are listed under **Archive**, where you can restore them.
- **Search** across page titles and note text (`Ctrl+F`).
- **Weekly plan with Google Gemini.** You type or paste your notes for the week. Stanton adds your open action points (optional), plus any meetings or notes you pick (none by default), and asks Gemini for a day-by-day plan laid out like your template. Each day gets a theme, a **Focus:** line and **Action:** bullets. You can edit it, copy it, open it as a Gmail draft, or save it as a note. To connect, go to **Settings → Google AI** and paste an API key from [Google AI Studio](https://aistudio.google.com/apikey). The key is encrypted with Windows DPAPI. **Show exactly what will be sent** shows the full request first.
- **Project colours.** Each project's colour is used for its pages: the card edges, the Meeting and Note buttons, bullets, tick circles and badges. Stars are always yellow. You can pick a preset or any custom colour.
- **Colour schemes:** Teal & yellow (#069494), Royal blue & orange-gold, or Graphite & amber. Each has light and dark modes, which follow Windows or can be set with the ◐ button or in **Settings**. Stars are always yellow.
- **Gemini model picker** on the Weekly plan page and in Settings. Models are grouped Lite / Flash / Pro, lightest first.

## Data

Everything is stored locally under `%APPDATA%\Stanton\`. Diagnostics such as docking problems are written to `stanton.log` in the same folder.

The data folder `%APPDATA%\Stanton\data\` contains:

- `stanton.json` holds all projects, pages and entries. It is written atomically, and the previous version is kept as `stanton.json.bak`.
- `images\` holds pasted and inserted images.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # Vite dev server + Electron with live reload of the UI
npm test           # unit tests
npm run typecheck
```

## Releases

Push a version tag and GitHub Actions builds Stanton on Windows and publishes a GitHub Release
with an installer, a portable `.exe` and a `.zip`:

```bash
npm version patch            # bumps package.json and creates a tag such as v0.1.1
git push --follow-tags
```

You can also run the **Release** workflow by hand from the Actions tab. With *publish* ticked, it creates the tag `v<package.json version>` and the release. Without it, the build is only uploaded as a workflow artifact.

## Building a Windows installer locally

Run this on Windows:

```bash
npm install
npm run dist       # → release/Stanton-Setup-x.y.z.exe, a portable .exe and a .zip
```

To cross-build from Linux or macOS, first install the Windows build of the FFI library that the dock uses:
`npm install --no-save --force @koromix/koffi-win32-x64`.

The dock uses [koffi](https://koffi.dev). Its JavaScript is bundled into `dist-electron/main.js`. Its native `koffi.node` is copied to `resources/koffi/win32_x64/` (see `extraResources`), where koffi looks for it through `process.resourcesPath`.

## Project layout

```
electron/        main process: window, storage, image protocol, AppBar docking
  appbar.ts      SHAppBarMessage via koffi (falls back to edge-snapping elsewhere)
src/             React renderer
  editor/        TipTap editor + action-point extension (stars on list items)
  components/    Home, Project, Page, Archive views, sidebar, title bar, dialogs
  lib/           action-point extraction, persistence bridge, helpers
  store.ts       zustand store and debounced persistence
```

Action points are not stored separately. They are list items in an entry's document with `action` (`open` / `done`) and `actionId` attributes. The Home and project views derive their lists from those, so the pinned copies always match the meeting.
