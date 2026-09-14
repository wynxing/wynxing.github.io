# 项目区内容与验收记录 · 2026-09-14

本记录仅对应首批项目区交付，不代表线上部署或三个项目的整体测试结论。

## 文案依据

- Rootly：核对当前 README 与 Wynn 署名提交 `65c25eb`（JSON-safe 工具结果边界）、`37ba0e2`（异常峰值采样）、`e7f9edf`（必备工具声明与遥测接线）、`3e38dcc`（重复调研与报告修复）。仓库为私有，公开正文不提供仓库链接、内部地址或业务数据；不使用历史评测指标。
- MayDolist：核对当前 README、Wynn 署名开发与发布记录、[PR #35](https://github.com/wynxing/MayDolist/pull/35) 和 [v1.3.8](https://github.com/wynxing/MayDolist/releases/tag/v1.3.8)。截图为仓库既有脱敏 Demo，见 [素材说明](ASSETS.md)。
- NeoCode：核对官方仓库 README 与 wynxing 已合入 PR：[Web/Electron #520](https://github.com/1024XEngineer/neo-code/pull/520)、[文件回退撤销 #648](https://github.com/1024XEngineer/neo-code/pull/648)、[记忆提取 #604](https://github.com/1024XEngineer/neo-code/pull/604)，以及会话与工作区相关的 #537、#653、#663。团队整体产品能力与个人贡献分开描述，不以 PR 数量代替成果。

三个项目日期均为介绍页发布日；正文明确成果核验时间。正文不宣称当前生产开关状态、线上准确率或用户规模。

## 本地验证

- pnpm 10.11.1：check 无错误、警告或提示；build 成功；19 项测试通过；git diff --check 通过。
- 回归覆盖：项目优先排序、日期与 ID 回退、相邻导航方向、首尾边界、草稿路由过滤、文章链接和 RSS、主题与筛选。
- 浏览器：桌面与 390px 手机视口的明暗主题、卡片换行、详情与截图缩放、标签筛选及清除、键盘 Enter 打开项目。手机详情无横向溢出。
- 搜索：通过构建后的 Pagefind 实际搜索 Rootly、MayDolist、NeoCode，均命中对应详情地址。
- 减少动画：检查现有全局媒体查询并新增静态回归检查，确认禁用动画、过渡和平滑滚动；未通过浏览器模拟系统减少动画设置。

## 交付边界

本次仅本地交付，未推送或部署。公开 PR 与版本记录用于核验文案，不代表本次重新运行过对应项目的测试。
