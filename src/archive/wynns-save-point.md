---
title: "【历史已失效】Wynn's Save Point 首版项目介绍"
description: "历史已失效：首版个人技术博客的项目介绍，不代表当前个人网站定位；当前要求见 design/CURRENT.md。"
date: 2026-05-28
tags: ["Astro", "MDX", "Cloudflare Workers"]
stack: ["Astro", "TypeScript", "MDX", "Pagefind", "Giscus"]
repo: "https://github.com/wynxing/wynxing.github.io"
demo: "https://wynn.229866007.workers.dev"
status: "building"
draft: true
---

> **历史资料，已失效，不作为当前设计依据。** 以下首版介绍中的博客定位、复古风格和演示地址均属于历史记录。当前定位见[当前产品与设计说明](../../design/CURRENT.md)，当前站点地址见[README](../../README.md)。

## 项目是什么

Wynn's Save Point 是一个个人技术博客，用来长期保存文章、项目复盘、技术笔记和个人思考。

## 为什么做

我需要一个比社交平台更稳定、比纯作品集更亲和的地方，记录自己在构建过程中的进度。

## 技术选择

Astro 适合内容站，Markdown / MDX 适合长期写作，Cloudflare Workers Static Assets 适合轻量部署。

搜索使用 Pagefind，评论使用 Giscus，RSS 和 Sitemap 保持静态站的基础可发现性。
