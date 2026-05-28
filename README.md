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

GitHub Actions deploys to Cloudflare Workers on pushes to `main`.

Required repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare Web Analytics uses the public site token configured in `src/consts.ts`.
