# WordList 多选功能实施计划（结合当前项目实际情况优化）

## 任务目标

在单词列表中增加基础多选能力，允许用户勾选当前列表里的多个词条，并通过工具栏按钮触发一个临时测试动作：

- 点击按钮后，在浏览器控制台输出当前选中词条的 `lemma`
- 第一阶段仅验证列表层的数据流、交互和组件边界
- 不在本次实现中引入批量删除、批量导出、跨页持久选择等扩展能力

这个计划基于当前仓库的真实实现来制定，而不是从零设计：

- 列表组件是 [`web/client/src/components/WordList/WordList.vue`](web/client/src/components/WordList/WordList.vue)
- 工具栏组件是 [`web/client/src/components/WordList/WordListToolbar.vue`](web/client/src/components/WordList/WordListToolbar.vue)
- 当前列表数据来自“本地记录 + 当前页数据库记录”的合并结果，而不是单一数组
- 当前数据库列表带分页，且搜索、排序、页大小切换都会重新请求数据

## 当前实现现状

### 已有基础

- `WordList.vue` 已负责列表展示、搜索、排序、分页、同步、删除、导出等主流程
- `WordListToolbar.vue` 已经承担顶部工具栏的按钮和筛选交互
- `displayedRecords` 是前端最终渲染用的数据源，已经把 `localRecords` 与 `dbRecords` 合并
- 每行当前已有查看、编辑、更多操作按钮，说明行级操作入口已经存在

### 需要特别注意的现实约束

1. 列表是混合数据源
本地词条和数据库词条可能同时存在于同一列表中，选中状态不能简单假设“`id` 全局唯一且不冲突”。

2. 数据库列表是分页数据
当前 `dbRecords` 只代表当前页，不是全量数据，因此“全选”只能定义为“全选当前屏幕可见列表项”，不能定义为全库全选。

3. 列表会频繁刷新
搜索、排序、分页、刷新、同步、删除都会触发列表变化。如果不定义清楚，选中状态会出现“选中了看不见的项”或者“按钮计数与页面不一致”的问题。

4. 当前功能目标只是测试版
用户要求的动作是“打印选中 lemma 到控制台”，因此第一阶段应优先做到低侵入、可验证、可扩展，而不是提前抽象成全局批量操作系统。

## 设计结论

### 第一版范围

- 在表格第一列加入复选框列
- 支持单行选择
- 支持表头“全选当前可见项”
- 在工具栏中增加一个“打印选中项”的测试按钮
- 按钮文案展示当前选中数量
- 点击按钮后输出选中项的 `lemma` 数组

### 第一版明确不做

- 不做跨页保留选择
- 不做搜索条件变化后的隐式保留选择
- 不做 Pinia 持久化
- 不做批量删除、批量同步、批量导出
- 不做 Shift 连选

### 推荐的状态策略

选中状态保留在 `WordList.vue` 本地，而不是放进 `wordStore`。

原因：

- 这是纯列表交互状态，不属于全局业务数据
- 当前需求只是测试动作，放进 store 会增加复杂度
- 后续如果演进为批量操作，再决定是否抽到 composable 或 store 更合理

## 实施方案

### 1. 在 `WordList.vue` 增加本地选中状态

建议新增：

- `selectedKeys: Ref<Set<string>>`
- `makeSelectionKey(item: WordRecord): string`
- `isSelected(item: WordRecord): boolean`
- `toggleSelection(item: WordRecord): void`
- `toggleSelectAllVisible(): void`
- `clearSelection(): void`

### 2. 选中键不要直接使用 `id`

由于当前列表来自本地和数据库两类来源，建议使用组合键：

```ts
const makeSelectionKey = (item: WordRecord) => `${item.isLocal ? 'local' : 'db'}:${item.id}`;
```

这样可以避免本地记录和数据库记录恰好出现相同 `id` 时互相污染选中状态。

### 3. 基于 `displayedRecords` 计算选中结果

建议增加以下计算属性：

- `selectedRecords`
- `selectedCount`
- `selectedLemmas`
- `isAllVisibleSelected`
- `hasSelection`

`selectedLemmas` 推荐继续复用当前列表里的 fallback 逻辑：

```ts
item.lemma || item.yield?.lemma
```

并在输出前过滤空值，避免控制台出现无意义项。

### 4. 明确定义“全选”的作用域

表头复选框的语义应为：

- 全选当前 `displayedRecords` 中的可见项
- 取消全选当前 `displayedRecords` 中的可见项

不要把它实现成“全库全选”或“跨页累计全选”，因为当前项目没有对应的数据模型和交互提示。

### 5. 在列表变化时主动清理选中状态

第一版推荐采用“保守清理”策略：

- 搜索执行后清空选中
- 排序变化后清空选中
- 页大小变化后清空选中
- 翻页后清空选中
- 手动刷新后清空选中
- 删除成功后清空选中
- 批量同步完成后清空选中

原因：

- 当前页面没有“已选中但不可见”的提示区域
- 数据是动态合并的，刷新后保留旧选中容易制造误操作
- 这是测试版，优先保证行为可理解

如果希望体验更丝滑，也可以改成“仅保留当前仍然可见的 key”，但第一版不建议增加额外复杂度。

### 6. 工具栏按钮放在 `WordListToolbar.vue`

建议在工具栏右侧操作区增加一个临时测试按钮，而不是放到每行 action menu。

原因：

- 这是针对“多选集合”的动作，不是单条记录动作
- 工具栏本身已经承载 `Sync All` 和 `Refresh`，语义上更统一
- 当前页面结构能容纳一个轻量按钮，不需要新增弹窗

推荐新增 props：

- `selectedCount: number`
- `hasSelection: boolean`

推荐新增 emits：

- `print-selected`

按钮建议：

- 仅在 `hasSelection === true` 时显示，避免空操作
- 文案类似 `Print Selected (3)`
- 保持现有页面风格，沿用当前工具栏的 `slate / blue` 设计语言，不额外做风格重构

### 7. 表格结构调整

建议在现有表格中增加一列选择列：

- 表头第一列：全选复选框
- 每行第一列：单项复选框
- 列宽控制在 `w-10` 或相近窄列

选中行建议增加轻量高亮：

- 维持当前 `hover:bg-slate-50/60` 逻辑
- 叠加选中态，比如 `bg-blue-50/60`

注意不要破坏当前右侧操作按钮区域宽度和对齐。

## 组件级改动清单

### 必改文件

[`web/client/src/components/WordList/WordList.vue`](web/client/src/components/WordList/WordList.vue)

- 增加本地选中状态和相关计算属性
- 在表格中加入复选框列
- 将 `selectedCount` / `hasSelection` 透传给工具栏
- 响应工具栏的 `print-selected` 事件
- 在合适的列表刷新节点调用 `clearSelection`

[`web/client/src/components/WordList/WordListToolbar.vue`](web/client/src/components/WordList/WordListToolbar.vue)

- 扩展 props 与 emits
- 增加测试按钮
- 保持现有工具栏布局稳定

### 当前阶段不建议修改

[`web/client/src/stores/wordStore.ts`](web/client/src/stores/wordStore.ts)

- 这个需求不需要把选中状态放入 store
- 除非实现过程中发现必须和批量业务动作共享，否则不动 store

## 推荐实施顺序

### Phase 1：最小可运行版本

1. 在 `WordList.vue` 建立本地选中状态和组合 key 逻辑
2. 为表格加入复选框列
3. 加入 `selectedCount` / `selectedLemmas` / `isAllVisibleSelected`
4. 在 `WordListToolbar.vue` 增加 `print-selected` 按钮
5. 点击按钮后输出选中的 lemma

### Phase 2：交互收口

1. 给选中行增加高亮样式
2. 在搜索、分页、排序、刷新等动作后统一清空选择
3. 检查“全选”和“局部取消”在混合数据源下是否正常

### Phase 3：验证与回归

1. 手动验证交互链路
2. 补一个前端单元测试，至少覆盖选中数量或工具栏按钮显示逻辑
3. 运行前端类型检查

## 测试与验证计划

### 手动验证

1. 进入首页词条列表，确认表格新增复选框列
2. 勾选单条记录，确认行高亮与按钮出现
3. 勾选多条记录，确认按钮数量同步更新
4. 点击工具栏按钮，确认控制台输出所选 lemma 数组
5. 点击表头复选框，确认只影响当前可见列表项
6. 执行搜索、翻页、排序、刷新，确认选中状态被清空
7. 本地词条与数据库词条混合存在时，确认选中计数准确

### 自动化验证

建议新增一个贴近组件行为的前端测试，优先级如下：

1. `WordListToolbar.vue`：`selectedCount > 0` 时显示按钮，否则隐藏
2. 或者 `WordList.vue`：选择若干项后，向工具栏传递正确计数

当前仓库前端测试基础较弱，因此这次至少补一个聚焦测试即可，不建议一次性引入复杂挂载测试矩阵。

### 命令验证

建议执行：

```bash
cd web/client && npm run type-check
cd web/client && npm run test
```

如果本次只新增了很轻的组件逻辑，至少也要完成 `type-check`。

## 风险与规避

### 风险 1：混合数据源导致选中冲突

规避方式：

- 使用 `local:${id}` / `db:${id}` 组合 key

### 风险 2：分页后保留旧选中造成误解

规避方式：

- 第一版统一清空选择，而不是跨页保留

### 风险 3：工具栏布局被挤压

规避方式：

- 将新按钮做成轻量按钮
- 保持与 `Sync All`、`Reload All` 同一视觉等级

### 风险 4：实现过度扩张

规避方式：

- 第一版只做“多选 + 打印”
- 不提前接入批量删除/导出/同步

## 验收标准

- 用户可以在 `WordList` 中勾选多个词条
- 工具栏会显示当前选中数量
- 点击测试按钮后，控制台能输出选中项 lemma 数组
- 表头全选仅作用于当前可见列表
- 搜索、排序、翻页、刷新后不会留下难以理解的历史选中状态
- 不修改全局 store 结构，不引入与当前需求无关的复杂抽象

## 后续可扩展方向

如果第一版验证通过，后续可以基于同一套选中模型继续扩展：

- 批量同步
- 批量导出到 Anki
- 批量删除
- 跨页保留选择
- 顶部显示“已选中 X 项，可清空”
- 将多选逻辑抽为 `useWordSelection` composable

但这些都应在第一版稳定后再推进，而不是和当前测试目标一起打包。
