## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Games

- Keep each game in `src/games/<slug>/`; use lowercase letters, digits, and hyphens.
- Export a default definition from `index.ts` using `satisfies GameDefinition` from `src/lib/games.ts`.
- Include `title`, `description`, `thumbnail`, `model`, and `creationMinutes`. Keep `index.ts` metadata-only; the game route loads `Game.astro` separately.
- Record the actual model and elapsed creation time in minutes (implementation and verification). Use `null` for unknown values; never guess.
- Write browser logic in TypeScript, imported by a processed `<script>` in `Game.astro`. Keep all page styles scoped (including html/body selectors) and assets within the game directory.
- `src/pages/` is reserved for routes. The shared registry generates both the gallery and game routes; do not manually register games.
- Each `Game.astro` owns its full HTML document, metadata, instructions, layout, and styles. Include the small `GameHeader` component from `src/components/GameHeader.astro` at the top of the body for navigation; there is no shared page layout.
- Use English for UI text and documentation.
- Use `sitePath()` from `src/lib/paths.ts` for site links so GitHub Pages subpaths work.
- Include restart behavior and keyboard/touch controls as appropriate. Clean up event handlers and animation loops when a game unmounts.
- Run `npm run check` and `npm run build`, then verify gameplay and navigation in a browser.

- Keep a 16:9 thumbnail in each game directory and import it with `?url` for the gallery.
