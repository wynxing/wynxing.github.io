# Wynn's Save Point

A personal technical blog and project archive built with Astro, MDX, Pagefind, Giscus, and Cloudflare Workers Static Assets.

## Commands

Use pnpm 10.11.1, pinned in `package.json` to match the Cloudflare build image.
The workspace explicitly includes the root package and uses pnpm 10's
`onlyBuiltDependencies` setting for the existing native dependency setup scripts.

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test
pnpm preview
pnpm worker:dev
pnpm deploy
```

## Appearance and reading

The homepage is a summer desktop: day/night meadow wallpaper, frosted glass
widgets, the original black-cat avatar, and a five-icon Dock. Public pages share
new system typography and readable opaque glass surfaces. The default theme
follows the OS; explicit choices persist under the existing `theme` key.
Mobile layouts retain a compact Dock and show local date/time without location
requests. Reduced-motion and reduced-transparency preferences are respected.

Astro ClientRouter preserves a single audio element across internal navigation.
Page-scoped listeners, search instances and observers are released before swaps
and initialized after navigation. Existing content URLs, CMS fields, RSS,
Pagefind indexing and Giscus pathname mappings are retained. RSS and the CMS
use full navigation. No frontend framework was added.

### Configure music

Edit `src/data/music.ts`. Each track has `id`, `title`, `artist`, `src` and an
optional `cover`. Use unique stable IDs, local `/music/...` assets under `public/`,
or stable HTTPS audio URLs. Remote audio hosts must allow direct playback;
HTTP range requests are recommended for reliable seeking. Cover images are
optional and fall back to a music icon on failure.

The production playlist is intentionally empty and displays “歌单准备中”.
Playback starts only after a visitor presses play. Internal navigation preserves
playback and volume; a refresh does not autoplay. Single-track playlists disable
track switching; multi-track playlists wrap. Failed audio can be retried.

### Validate

Run `pnpm check`, `pnpm build`, then `pnpm test` (generated-link tests read `dist`).
Use `pnpm preview` to include the generated Pagefind search index. Tests cover
theme preferences, filters, links, player state, race conditions and lifecycle
cleanup. Test-only real audio is available with:

```bash
python tests/serve_audio_fixture.py --port 4322
```

This loopback-only server serves the existing build and injects test tracks into
responses, without editing source or `dist`. Its third track fails once, then
succeeds on retry; restarting the server resets this scenario. The synthesized
audio is not part of the public website or production playlist.

See `design/summer-reference.png` for the visual direction,
`design/ASSETS.md` for image provenance and `design/QA.md` for browser validation.

## Deployment

The production site is configured for:

```text
https://wynn.myblog-site.workers.dev
```

Deployment is handled by Cloudflare Workers Git integration. Connect the
`wynxing/wynxing.github.io` repository in Cloudflare and use these build settings:

```text
Root directory: /
Install command: pnpm install --frozen-lockfile
Build command: pnpm build
Deploy command: pnpm exec wrangler deploy
```

The deploy command expects `dist/` to already exist. `pnpm build` runs Astro and
Pagefind, producing both the static site and search index before Wrangler reads
`wrangler.jsonc`.

Local deployment checks:

```text
pnpm check
pnpm build
pnpm exec wrangler deploy --dry-run
```

Cloudflare Web Analytics uses the public site token configured in `src/consts.ts`.

## Custom domain

The public URL is still the Workers subdomain. To attach a real domain:

1. Add the hostname in Cloudflare (Workers & Pages → `wynn` → Settings → Domains & Routes).
2. Point the DNS record to the Worker, or use a proxied CNAME.
3. Update `site` in `astro.config.mjs` and `SITE_URL` in `src/consts.ts` to the new origin, then rebuild.

Keep those two values in sync so canonical URLs, Open Graph tags, sitemap, and RSS stay on the same host.
