# Changelog

## [1.2.2] - 2026-01-26

### 重构 (Refactor)
- **前端架构解耦**: 将原本庞大的 `index.html` 拆分为模块化的 JavaScript (ES Modules) 和独立的 CSS 文件，提升代码可维护性。
  - **模块化**: 引入 `main.js` 作为入口，拆分出 `list.js`, `sync.js`, `editor.js`, `settings.js` 等独立模块。
  - **状态管理**: 创建 `state.js` 集中管理 `localRecords`、分页信息和数据库连接状态，彻底解决全局变量污染导致的 `ReferenceError`。
  - **样式分离**: 提取内联样式至 `public/css/style.css`。

### 新增功能 (Features)
- **高级列表控制**:
  - **模糊搜索**: 支持单词的部分匹配搜索（不区分大小写）。
  - **多重排序**: 新增排序下拉菜单，支持 A-Z、Z-A、最新创建、最旧创建四种排序方式。
  - **客户端分页**: 新增分页组件，支持自定义每页显示数量 (Page Size)。
- **配置与限制**:
  - **本地存储上限**: 在设置中可配置 "Max Local Items" (暂存区最大数量)。
  - **存储保护**: 当本地暂存区达到上限时，系统现在会阻止新记录的添加并报错，而不是静默覆盖旧数据。
- **导航优化**: Header 新增 Words / Phrase 页面切换导航。

### 修复 (Fixes)
- 修复了同步按钮点击无效的问题 (`localRecords is not defined`)。
- 修复了 `Max Local Items` 设置为 1 时，添加第二个词会导致第一个词被静默覆盖的问题。
