---
title: Veil
description: Windows 屏幕保持关闭工具：按物理屏决定关或开，直到主动恢复。
date: 2026-10-13
order: 4
role: 个人项目 · 桌面开发与 1.0.1 发布
highlight: 指定物理屏保持关闭，直到从面板或紧急热键主动恢复。
tags: [桌面应用, 系统工具]
stack: [Rust]
repo: https://github.com/wynxing/Veil
status: shipped
version: 1.0.1
---

## 产品介绍

Veil 是 Windows 上的屏幕保持关闭工具。按物理屏决定关或开，直到主动恢复。

「你玩你的。屏幕，由你决定。」

可以指定物理屏保持关闭。恢复可以从面板操作，也可以按紧急热键 Ctrl+Alt+Shift+F10。全部关闭时，使用已签名的第三方 MTT 辅助输出驱动保留显示路径。

应用常驻托盘。正常退出前会先恢复屏幕。失败时说明原因，并保留恢复入口。默认不改电源计划。睡眠或待机打断后，会自动恢复显示。每 24 小时最多检查一次更新，只提示，不自动下载。

Veil 用 Rust 编写，以 MIT 许可发布，仅支持 Windows 11 x64。

## 我负责的内容

Veil 是我以 MIT 许可发布的个人项目。正式版按物理屏保持关闭，直到从面板恢复，或按下紧急热键 Ctrl+Alt+Shift+F10。全部屏幕关闭时，靠已签名的第三方 MTT 辅助输出驱动保留显示路径。正常退出前先恢复屏幕；失败时说明原因，并保留恢复入口。

## 最终成果

正式版 1.0.1 已发布，仅适用于 Windows 11 x64。GitHub Releases 提供 VeilSetup-1.0.1-x64.exe。安装包未签名，可能会出现 SmartScreen 提示。

## 相关链接

- [源代码](https://github.com/wynxing/Veil)
- [Releases](https://github.com/wynxing/Veil/releases)
