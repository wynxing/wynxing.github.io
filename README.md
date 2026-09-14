# Wynn's Save Point

Wynn 的个人网站：一个可以认识 Wynn、看看他的作品、读文章，也可以停留片刻的夏日桌面。文章是其中一个板块，首页以个人身份和各板块入口组织体验。

当前视觉方向是夏日晴空绿野、蓝调夏夜、macOS 风格的液态磨砂玻璃和彩色立体 Dock 图标。保留站名、黑猫头像和真实内容。

## 当前定位与文档入口

- [产品与设计说明](design/CURRENT.md)：当前产品定位、视觉方向与功能边界；涉及页面设计时先读这份。
- [协作指引](AGENTS.md)：开发工作树、文档使用和验证要求。
- [素材说明](design/ASSETS.md)：当前图片和图标的来源。
- [验收记录](design/QA.md)：指定版本的历史验证结果，不代表最新部署状态。
- [历史资料](src/archive/README.md)：早期草稿，已失效的设计描述不作为当前需求。

实现使用 Astro、MDX、Pagefind、Giscus 和 Cloudflare Workers Static Assets。`/blog/` 是保留的文章地址，不定义整个网站的定位。下面的命令和配置说明服务于当前实现。

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
widgets, the original black-cat avatar, and a four-icon Dock. Public pages share
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
