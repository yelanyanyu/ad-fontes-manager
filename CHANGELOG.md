# 变更日志

## [1.0.0] - 2026-01-28

### 🎉 首次发布：Etymos Manager (Ad Fontes Manager)

我们很高兴地宣布 **Etymos Manager** 的首次正式发布，这是 Ad Fontes 生态系统中专门的数据管理组件。该工具旨在通过“回到源头”的方法，帮助语言学习者管理、可视化和存储复杂的词源数据。

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
*欢迎体验全新的语言学习方式。*
