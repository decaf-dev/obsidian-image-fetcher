# Obsidian Image Fetcher

An [Obsidian](https://obsidian.md) plugin that fetches images from a web page and saves one to your note.

Given a note with a `url` property in its frontmatter, Image Fetcher scrapes the page for images, shows them in a picker, and — when you choose one — downloads it into your vault and records its path in the note's `image` frontmatter property.

## Usage

1. Add a `url` property to the frontmatter of a note:

   ```yaml
   ---
   url: https://example.com/article
   ---
   ```

2. Run the command **Fetch images for URL** from the command palette, or click the image icon in the left ribbon.
3. The page is scanned for images and a picker modal opens. Click an image to select it, then press **Save**.
4. The selected image is downloaded into your attachments folder and the note's frontmatter is updated:

   ```yaml
   ---
   url: https://example.com/article
   image: "[[my-note-image.png]]"
   ---
   ```

## Settings

- **Frontmatter URL key** — the property the plugin reads the page URL from (default `url`).
- **Frontmatter image key** — the property the chosen image is written to (default `image`).

## How it works

- **Image sources** — collects `<img>` elements plus Open Graph (`og:image`) and Twitter card (`twitter:image`) meta tags. Relative URLs are resolved against the page URL and de-duplicated.
- **Download location** — uses your vault's configured attachment folder (via Obsidian's `getAvailablePathForAttachment`), so files land where your other attachments go with a non-colliding name.
- **Frontmatter** — the downloaded image is written to the `image` property as a wikilink (e.g. `[[my-note-image.png]]`) using Obsidian's frontmatter API.

## Development

This plugin is built with [Svelte 5](https://svelte.dev) and [esbuild](https://esbuild.github.io).

```bash
bun install      # install dependencies
bun run dev      # build and watch for changes
bun run build    # type-check and produce a production build
bun run check    # run svelte-check
bun test         # run the unit tests
```

Unit tests for the utility functions live in `test/` and run on [Bun's](https://bun.sh) built-in test runner — run them with `bun test`. To test the plugin end to end, build into a vault's `.obsidian/plugins/image-fetcher/` folder and enable the plugin in Obsidian's settings.

## License

MIT
