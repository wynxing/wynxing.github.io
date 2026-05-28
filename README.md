# Wynn's Save Point

A personal technical blog and project archive built with Astro, MDX, Pagefind, Giscus, and Cloudflare Workers Static Assets.

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm preview
pnpm worker:dev
pnpm deploy
```

## Deployment

The production site is configured for:

```text
https://wynn.229866007.workers.dev
```

Deployment is handled by Cloudflare Workers Git integration. Connect the
`Yumiue/Yumiue.github.io` repository in Cloudflare and use these build settings:

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
