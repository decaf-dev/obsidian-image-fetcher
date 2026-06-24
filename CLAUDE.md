# CLAUDE.md

Guidance for working in this repository.

## What this is

**Obsidian Image Fetcher** — an Obsidian plugin that scrapes images from a web page and saves one to a note. The user puts a `url` in a note's frontmatter; the plugin fetches the page, shows the images in a picker modal, and on save downloads the chosen image into the vault and writes its path to the note's `image` frontmatter property.

Plugin id: `image-fetcher` (see `manifest.json`). Desktop-only.

## Commands

```bash
npm run dev      # esbuild watch build
npm run build    # tsc -noEmit type-check + esbuild production build
npm run check    # svelte-check
npm test         # bun test — unit tests for the utility functions
```

Unit tests cover the pure utility functions (see Testing below). They do **not** exercise the Obsidian integration paths, so still verify end-to-end behavior by building and manually testing in a vault (build into `<vault>/.obsidian/plugins/image-fetcher/` and enable the plugin).

## Architecture

Built with **Svelte 5** (runes: `$props`, `$state`, `$derived`, `$effect`; `mount`/`unmount`) and **esbuild** (`esbuild-svelte`, `css: "injected"` — component styles are bundled into `main.js`, there is no separate CSS file). `esbuild.config.mjs` sets `mainFields`/`conditions` to prefer the `"svelte"` export condition so Svelte component libraries (e.g. `svelte-tiny-virtual-list`) are pulled as `.svelte` source and recompiled with our Svelte version rather than as a prebuilt bundle.

End-to-end flow:

- `src/main.ts` — plugin entry. Registers a ribbon icon and the `fetch-images-for-url` command, both calling `fetchImagesForActiveNote()`. Reads the URL from the active note's frontmatter (via `metadataCache.getFileCache`) using the configurable `frontmatterUrlKey`, fetches images, and opens the picker modal with an `onSave` callback. Holds the plugin `settings` (`frontmatterUrlKey`, `frontmatterImageKey`, `instagramCookieSecretId`, `instagramNameByUsername`, `threadsNameByUsername`, `instagramScrollCount`, `userAgent`, `debug`) with load/save. `resolveBaseName(file, url)` picks the saved image's filename stem — the Instagram username (`instagramUsernameFromUrl`, gated by `instagramNameByUsername`) or the Threads username (`threadsUsernameFromUrl`, gated by `threadsNameByUsername`) when the matching per-site toggle is on and a username can be parsed, otherwise the note title (`<note title>`). The Instagram cookie is **not** stored in plugin data — settings hold only the secret's id, and the raw cookie is resolved at fetch time via `app.secretStorage.getSecret(settings.instagramCookieSecretId)` before building `RequestOptions`.
- `src/obsidian/image-fetcher-setting-tab.ts` — settings UI, split into four `.setHeading()` sections. **General**: text inputs for the URL and image frontmatter property names. **Image Name**: toggles to name Instagram and Threads images by username. **Instagram**: a `SecretComponent` (`addComponent`) for selecting/creating the Instagram cookie secret in Obsidian's secret storage, a numeric auto-scroll count input, and a User-Agent input. **Logs**: a debug toggle.
- `src/utils/http-utils.ts` — `fetchImagesFromUrl(url)`: `requestUrl` GET + `DOMParser`, collects `og:image`/`twitter:image` meta tags and `<img src>`, resolves relative URLs against the page URL, dedupes. Returns `[]` on error.
- `src/obsidian/image-picker-modal.ts` — `ImagePickerModal extends Modal`; mounts the Svelte component in `onOpen`, unmounts in `onClose`. Wraps the `onSave` callback so it closes the modal after choosing.
- `src/svelte/image-picker.svelte` — the picker UI: single-select, Save button, and a header showing the total image count. The thumbnail grid is **virtualized** with `svelte-tiny-virtual-list` — the flat `imageUrls` are chunked into rows of `COLUMNS` (2) and the list renders one row per virtual item, so large result sets stay performant. Images show at their natural aspect ratio (no cropping) and are never upscaled past their natural size (small images keep their real dimensions, centered): each image's natural dimensions are measured on its `load` event into the `dims` array, row heights are computed from the measured column width (`bind:clientWidth`) — clamped to natural width — via a function-based `itemSize`, and a `sizeVersion` counter is bumped on each load so the derived `itemSize`/`listHeight` re-run and the list re-lays-out rows. Props: `{ imageUrls, onSave }`. Scoped styles use Obsidian CSS variables (`--background-*`, `--interactive-accent`, etc.).
- `src/utils/save-image.ts` — `saveImageToNote(app, file, imageUrl, imageKey, options, baseName)`: downloads via `requestUrl`, picks an extension from the `content-type` header (falling back to the URL), saves to `<baseName>.<ext>` (the caller-supplied stem) with `fileManager.getAvailablePathForAttachment` + `vault.createBinary`, then writes `image` via `fileManager.processFrontMatter`.

## Testing

Unit tests run on **Bun's** built-in runner (`bun:test`); Bun is also the package manager (`bun.lock`). Run with `npm test` or `bun test`.

- Tests live in `test/` (e.g. `test/http-utils.test.ts`). Scope is the **pure** logic only — `isInstagramHost`, `instagramUsernameFromUrl`, `isThreadsHost`, `threadsUsernameFromUrl`, `buildRequestHeaders`, `bestFromSrcset`, `bestFromImg`, `describeHeaders`, `createDebugLogger`, `extensionFromUrl`. The Obsidian-bound paths (`fetchImagesFromUrl`, `saveImageToNote`) are not covered.
- Helpers that need testing are exported from their modules (`bestFromSrcset`/`bestFromImg` in `http-utils.ts`, `extensionFromUrl` in `save-image.ts`).
- `test/setup.ts` is a `bunfig.toml` preload that `mock.module("obsidian", …)`s the types-only `obsidian` package so Bun can load the modules under test; it must run before any test imports them.
- `bestFromImg` is tested with a fake `{ getAttribute }` object cast to `Element` — no DOM dependency.
- TS config: the root `tsconfig.json` excludes `test/` (keeps `tsc -noEmit` in the build green); `test/tsconfig.json` adds `@types/bun` so the editor resolves `bun:test`.

## Conventions

- Use Obsidian's `requestUrl` (not `fetch`) for network calls — it avoids CORS issues.
- Use `fileManager.processFrontMatter` to read/write frontmatter, not manual string manipulation.
- Selection is single-image. The URL and image frontmatter property names are configurable in settings (`frontmatterUrlKey` default `url`, `frontmatterImageKey` default `image`).
- The frontmatter value is a wikilink to the saved image's filename (e.g. `[[name.png]]`), set in `save-image.ts`.
- Git: branches and commits follow Conventional Commits. End commit messages with the `Co-Authored-By` trailer.
