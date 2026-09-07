# Wynn's Save Point

A personal technical blog and project archive built with Astro, MDX, Pagefind, Giscus, and Cloudflare Workers Static Assets.

## Commands

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

The public site uses mint accents and frosted surfaces in both light and dark
mode. The default follows the system appearance and responds to system changes.
The appearance selector also supports explicit light/dark choices, stored in the
existing `theme` local-storage key. Existing choices are preserved.

The homepage shows the six latest published articles without duplication, plus
up to two notes/projects when those collections contain published entries.
List filters use `?category=Thoughts&tag=Architecture`; category and tag are
combined, and browser history restores the selection. Existing content URLs,
CMS fields, RSS, and Giscus pathname mappings are unchanged.

After `pnpm build`, run `pnpm test` for theme/filter behavior and generated link
checks. `pnpm preview` includes the generated Pagefind search index. The pnpm
workspace configuration allows the existing esbuild, sharp, and workerd native
dependency setup scripts; no frontend framework has been added.

## Deployment

The production site is configured for:

```text
https://wynn.229866007.workers.dev
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
