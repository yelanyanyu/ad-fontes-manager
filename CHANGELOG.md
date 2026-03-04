# 变更日志

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 安全
- 计划修复：配置端点 `/api/core/config` 添加身份验证（[task_plan.md](./task_plan.md)）
- 计划修复：限制 `x-db-url` 请求头功能，防止 SSRF 攻击
- 计划升级：Node.js 到 22 LTS，Express 到 5.x
- 计划添加：Helmet 安全头中间件

### 文档
- 新增：项目修复计划文档 [task_plan.md](./task_plan.md)
- 新增：问题分析文档 [findings.md](./findings.md)
- 新增：进度跟踪文档 [progress.md](./progress.md)
- 新增：配置规范文档 [config.schema.yml](./config.schema.yml)
- 更新：README.md 修正技术栈描述，添加新文档链接
- 更新：DEVELOPMENT.md 更新架构说明，添加 Vue 3 详情

---

## [1.0.0] - 2026-01-28

### 🎉 首次发布：Etymos Manager (Ad Fontes Manager)

我们很高兴地宣布 **Etymos Manager** 的首次正式发布，这是 Ad Fontes 生态系统中专门的数据管理组件。该工具旨在通过"回到源头"的方法，帮助语言学习者管理、可视化和存储复杂的词源数据。

### 🌟 核心特性

- **离线优先架构 (Offline-First)**：
  - **无缝离线模式**：利用浏览器 LocalStorage，无需网络连接即可编写和保存单词。
  - **智能同步引擎**：联网后自动检测冲突，并提供可视化的 Diff 界面来解决冲突（本地 vs 远程）。
  - **双重存储**：灵活的架构，支持轻量级本地 JSON 存储和强大的 PostgreSQL 数据库。

- **现代 Web 界面**：
  - **Vue 3 & Tailwind CSS**：完全重写的现代化前端，提供响应式、快速且精致的用户体验。
  - **可折叠侧边栏**：优化的屏幕空间利用，采用现代化的导航布局。
  - **高级列表视图**：支持服务端分页、模糊搜索和多种排序选项（A-Z、日期）。

- **强大的编辑器与预览**：
  - **YAML 编辑器**：集成编辑器，支持实时语法校验和错误高亮。
  - **双重预览模式**：
    - **卡片模式**：精美渲染的单词卡片，用于复习词源和意象。
    - **Markdown 模式**：整洁、易于复制的 Markdown 输出，适配笔记应用（Obsidian/Notion）。

- **生态系统集成**：
  - 专为与 [Ad Fontes Prompts](https://github.com/yelanyanyu/ad-fontes-prompts)（内容生成）和 [Ad Fontes Browser Extension](https://github.com/yelanyanyu/ad-fontes-browser-extension)（快速采集）无缝协作而设计。

### 🛠 技术亮点

- **后端**：Node.js + Express REST API。
- **前端**：Vue 3 + Pinia (状态管理) + Vite。
- **数据库**：PostgreSQL，支持 JSONB 以实现灵活的 Schema 审计。
- **安全性**：已就绪的行级安全性 (RLS)，为未来的多用户支持做好准备。

---

## 版本说明

### 版本号格式
本项目使用语义化版本控制（SemVer）：

- **MAJOR**：不兼容的 API 修改
- **MINOR**：向下兼容的功能新增
- **PATCH**：向下兼容的问题修复

### 版本标签说明

- `[SECURITY]`：安全相关修复
- `[BREAKING]`：破坏性变更
- `[DEPRECATED]`：即将废弃的功能
- `[REMOVED]`：已移除的功能

---

*欢迎体验全新的语言学习方式。*
