---
title: Lanwork
description: 一个热键呼出的 Windows 11 桌面效率工具：搜索、待办、便签、收纳，都在手边。
date: 2026-10-13
order: 2
role: 个人项目 · 桌面开发与 v0.1.0 发布
highlight: 热键一次搜应用、文件、待办、便签和网址，数据只留在本机。
tags: [桌面应用, 效率工具]
stack: [Rust, Slint]
repo: https://github.com/wynxing/Lanwork
status: shipped
version: v0.1.0
---

## 产品介绍

Lanwork 是一个热键呼出的 Windows 11 桌面效率工具。搜索、待办、便签、收纳，都在手边。界面用 Rust 和 Slint 原生实现，不使用 Vue、Tauri 或 WebView2。

按 Ctrl+Alt+M 呼出搜索条，一次可以搜应用、文件、待办、便签，也可以搜网址和网页。文件搜索使用 Everything，并回退到 Windows Search。搜索支持拼音和首字母，输入法组合期间不会误触。

待办包含清单、到期日、周期和回收站。便签可以悬浮，也可以钉住。收纳只保存路径引用，并可以关联待办。应用常驻托盘，支持主题，并每日自动备份。数据存在本机 `Documents\Lanwork`，格式是 JSON，没有云同步，也没有账号。

## 我负责的内容

Lanwork 是我以 MIT 许可发布的个人项目。v0.1.0 基础版包含上面的搜索、待办、便签和收纳，以及托盘、主题和每日自动备份。

设置页界面、到期通知、热角和快速收集还没有做。

## 最终成果

v0.1.0 基础版已公开发布。GitHub Releases 提供安装版 .exe 和便携版 .zip。

## 相关链接

- [源代码](https://github.com/wynxing/Lanwork)
- [Releases](https://github.com/wynxing/Lanwork/releases)
