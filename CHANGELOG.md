# Changelog - Ad Fontes Manager

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.3.0] - 2026-03-05

### ✨ New Features

- **统一日志系统**: 集成 Pino 日志框架，支持结构化 JSON 日志、日志轮转和请求上下文追踪
- **全局状态管理**: 添加全局状态管理模块和工具函数，优化状态共享
- **错误处理增强**: 添加全局错误处理中间件和自定义错误类，提升错误响应质量
- **配置管理**: 支持通过 `/api/core/config` 端点动态管理应用配置

### 🔧 Improvements

- **词汇服务重构**: 将单词服务模块重构为多文件结构，提升可维护性和可测试性
- **数据库字段映射修复**: 修复 cognates 和 synonyms 表的字段映射问题，确保 YAML 数据正确保存
- **Pino 日志 API 修复**: 修正所有日志调用参数顺序（对象在前，消息在后）
- **文档整理**: 将所有文档统一迁移到 `docs/` 目录，更新文档结构和引用

### 🔐 Security

- **Helmet 安全头**: 添加 Helmet 中间件，提供 XSS、点击劫持等安全防护
- **管理员身份验证**: `/api/core/config` 端点需要 `x-admin-token` 验证
- **敏感数据清理**: 从 Git 历史中移除 `config.json`，防止敏感信息泄露
- **连接池安全配置**: 添加最大连接数(20)、空闲超时(30s)、连接超时(5s)限制

### 🏗️ Infrastructure

- **Node.js 升级**: 升级至 Node.js 22 LTS，获得长期支持
- **代码规范**: 统一代码格式，添加 ESLint 和 Prettier 配置
- **依赖升级**: 升级 Express 至 5.0，修复已知安全漏洞

### 📝 Documentation

- **数据库文档**: 添加完整的数据库 Schema 文档，包含 Mermaid ER 图
- **日志文档**: 添加后端日志系统使用文档
- **开发文档**: 更新开发文档，包含架构说明和开发者指南
- **安全指南**: 添加安全指南，包含敏感数据管理和最佳实践

---

## [1.2.3] - 2026-01-26

### ✨ New Features

- **预览集成 (Preview Integration)**:
  - 双模式预览: 完美移植 yml2html 工具，支持"精美卡片"和"Markdown 笔记"两种预览模式
  - 深度解析: 预览模式支持词源分析、历史典故、视觉画面等核心字段的完整渲染
  - 交互增强: 列表卡片新增"更多"菜单，支持快速进入预览页

- **编辑器增强**:
  - 实时校验: 集成 js-yaml，在编辑 YAML 时提供实时的格式校验与错误提示 (Valid/Error)

- **布局重构**:
  - 侧边栏设计: 将顶部导航重构为可收起的左侧侧边栏 (Sidebar)，优化屏幕空间利用率
  - 头部优化: 统一 Header 区域，固定展示 Logo 与应用标题

### 🔧 Improvements

- **UI/UX**:
  - 搜索栏迁移: 将搜索框从顶部 Header 移至列表工具栏，使筛选操作更贴近数据列表
  - 侧边栏交互: 收起侧边栏时自动居中图标，展开时恢复左对齐，提供更精致的视觉体验
  - Markdown 样式: 引入 github-markdown-css，确保预览模式下的 Markdown 渲染（列表、引用、代码块）样式规范美观

---

## [1.2.2] - 2026-01-20

### ✨ New Features

- **卡片图片生成**: WordPreview 支持生成并下载单词卡片图片
- **服务端分页**: 实现单词列表的服务端分页和详情按需加载
- **搜索功能增强**: 
  - 添加精确匹配搜索模式并支持持久化设置
  - 添加搜索输入标准化和防抖处理
- **单词添加接口**: 添加单词添加接口并实现严格 YAML 校验
- **单词详情接口**: 新增查询单词详情的对外接口

### 🔧 Improvements

- **前端重构**: 重构前端为 Vue 3 + Vite 单页应用
- **端口配置**: 将端口配置统一迁移到 config.json 中

---

## [1.2.0] - 2026-01-15

### ✨ New Features

- **智能冲突解决**: v2 版本引入智能冲突检测和解决机制
- **YAML 到数据库**: 新增 YAML 到 PostgreSQL 数据库的 Web 服务

---

## [1.1.0] - 2026-01-10

### ✨ New Features

- **离线优先架构**: 浏览器 LocalStorage + PostgreSQL 双重存储
- **智能同步**: 离线 -> 在线自动批量上传
- **冲突检测**: 可视化差异对比工具

---

## [1.0.0] - 2026-01-01

### ✨ New Features

- 初始版本发布
- 基础词汇管理功能
- YAML 编辑器支持
