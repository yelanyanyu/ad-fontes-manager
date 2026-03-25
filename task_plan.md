# Anki 导出与导入实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 为词条预览与词条列表中的独立 `Export` 入口提供完整的 Anki 工作流，支持按目标 note 字段映射导出、直接连接 AnkiConnect 向 `test` 牌组导入验证，并支持生成可分发的 `.apkg` 包。

**Architecture:** 采用“前端发起导出 + 导出服务统一编排 + 本地集成能力分层”的方式。前端负责选择导出动作、显示预览和反馈；导出服务负责字段映射、note 载荷组装和动作分发；AnkiConnect 联调用于本地即时验证；`.apkg` 生成功能通过独立打包层实现，避免把复杂打包逻辑直接塞进 Vue 组件。

**Tech Stack:** Vue 3.5、Pinia、TypeScript、现有 `generator.ts`、Clipboard API、localStorage、AnkiConnect、`.apkg` 打包库或本地 Node 打包脚本、`yml_example.yml` 作为样例输入。

---

## 1. 背景与新增目标

当前项目已经同时存在：

- `Copy HTML Code (Anki)` 这个核心功能
- 词条菜单中的独立 `Export` 按钮

这两个入口的职责需要继续保持区分：

- `Copy HTML Code (Anki)` 保持不变，继续服务于现有核心能力
- 独立 `Export` 按钮升级为正式的 Anki 导出 / 导入入口

在此基础上，新增的实际需求不再只是“复制 HTML”或“下载 TSV”，而是完整支持以下能力：

1. 针对目标 Anki note model 的固定字段进行映射
2. 直接连接本地 AnkiConnect
3. 在 `test` 牌组中完成真实导入测试
4. 支持导出 `.apkg`
5. 用 `yml_example.yml` 验证完整链路

## 2. 目标字段模型

根据你提供的目标卡组截图，目标字段固定为：

1. `Word`
2. `Context`
3. `notes`
4. `Back`
5. `Add Reverse`
6. `Media`

这意味着本次计划不能再只做“通用映射 UI”，而需要优先围绕该 note model 落地一套可工作的默认映射和真实导入流程。

### 2.1 字段语义建议

- `Word`
  - 卡片正面核心词条
  - 默认取 `yield.lemma`

- `Context`
  - 用户上下文句或核心例句
  - 默认优先取 `yield.user_context_sentence`

- `notes`
  - 供 Anki 浏览器中快速查看的简要备注
  - 可由词性、音节划分、中文释义、同源词摘要等拼接

- `Back`
  - 卡片背面完整内容
  - 默认由现有 `generator.ts` 输出的主卡 HTML 或结构化导出结果生成

- `Add Reverse`
  - 控制是否生成反向卡
  - 建议使用布尔值或约定字符串，如 `true` / `false`

- `Media`
  - 关联媒体文件名或媒体占位字段
  - 第一阶段允许为空，但字段结构必须保留

## 3. 范围

### 3.1 本次必须完成

1. 保持 `Copy HTML Code (Anki)` 核心功能和文案不变。
2. 将独立 `Export` 按钮升级为正式 Anki 导出入口。
3. 支持基于上述 6 个固定字段生成 note 数据。
4. 支持从 `yml_example.yml` 对应的数据结构生成 Anki note。
5. 支持通过 AnkiConnect 将 note 直接导入本地 `test` 牌组。
6. 支持导出 `.apkg` 文件。
7. 提供导出预览和导入反馈。
8. 对核心映射、AnkiConnect 载荷和 `.apkg` 生成增加测试与手工验证步骤。

### 3.2 本次不做

- 不替换 `Copy HTML Code (Anki)` 现有行为
- 不做多 note type 动态建模
- 不做复杂模板编辑器
- 不做云端同步到 AnkiWeb
- 不做批量选择多个词条导出

## 4. 样例输入约束

本计划默认使用 `yml_example.yml` 作为导出设计与验证的样例输入。

### 4.1 已确认的重要数据来源

从 `yml_example.yml` 可以直接提取或推导：

- `yield.lemma`
- `yield.user_context_sentence`
- `yield.part_of_speech`
- `yield.syllabification`
- `yield.contextual_meaning.en`
- `yield.contextual_meaning.zh`
- `etymology.*`
- `cognate_family.*`
- `application.selected_examples`
- `nuance.*`

### 4.2 默认字段映射建议

```ts
const defaultFieldMapping = {
  Word: 'yield.lemma',
  Context: 'yield.user_context_sentence',
  notes: 'summary.notes',
  Back: 'rendered.backHtml',
  'Add Reverse': 'exportOptions.addReverse',
  Media: 'media.primary',
};
```

### 4.3 `notes` 字段建议内容

建议先生成紧凑且稳定的摘要，而不是堆满整个背面内容：

- `part_of_speech`
- `syllabification`
- 英文释义
- 中文释义
- 1 条最关键的词源摘要

这样更利于在 Anki Browser 中快速浏览。

## 5. 导出能力设计

本次导出能力分成三条路径：

1. **预览导出**
   - 让用户看到即将发送 / 打包的 note 内容

2. **AnkiConnect 直接导入**
   - 直接把 note 发送到本地 Anki 的 `test` 牌组

3. **`.apkg` 离线导出**
   - 生成可分发、可手工导入的牌组文件

### 5.1 为什么需要三条路径

- 预览解决“导入前可见性”
- AnkiConnect 解决“本地即时验证”
- `.apkg` 解决“可分享、可备份、无需依赖本地 Anki 正在运行”

## 6. 推荐架构

```text
UI Layer
  WordPreview.vue
  WordActionMenu.vue
  AnkiExportModal.vue

State / Orchestration
  useAnkiExport.ts

Domain / Export Logic
  ankiExportService.ts
  ankiFieldMapper.ts
  ankiBackRenderer.ts

Integration Layer
  ankiConnectService.ts
  apkgExportService.ts

Types / Contracts
  types/anki.ts

Input Fixtures
  yml_example.yml
```

### 6.1 模块职责

- `AnkiExportModal.vue`
  - 预览字段映射结果
  - 选择导出动作
  - 触发导入到 Anki / 导出 `.apkg`

- `useAnkiExport.ts`
  - 管理弹窗状态、当前词条、导出动作 loading/error/success
  - 调用各 service

- `ankiExportService.ts`
  - 从词条数据生成统一 note 结构
  - 聚合字段映射、背面渲染和媒体占位

- `ankiFieldMapper.ts`
  - 把词条数据映射到固定字段：
    - `Word`
    - `Context`
    - `notes`
    - `Back`
    - `Add Reverse`
    - `Media`

- `ankiConnectService.ts`
  - 负责和本地 AnkiConnect 通信
  - 检查服务可达性
  - 创建牌组 / 添加 note / 可选清理测试数据

- `apkgExportService.ts`
  - 负责 `.apkg` 打包
  - 组装 deck、model、notes、media

## 7. 关键决策

### 7.1 `Export` 按钮的正式职责

`Export` 按钮不再只承担“提示未实现”，而是承担完整工作流：

- 查看导出预览
- 导入到本地 Anki
- 下载 `.apkg`

### 7.2 为什么要真实接 AnkiConnect

如果只做静态导出，计划会停留在“格式看起来像能用”。  
你现在明确要求在 `test` 牌组中直接导入验证，所以必须把 AnkiConnect 纳入主路径，而不是后续扩展。

### 7.3 为什么 `.apkg` 不能只靠前端拼字符串

`.apkg` 本质上不是普通文本导出，而是包含 deck/model/note/media 的打包格式。  
因此应当把 `.apkg` 生成看作独立能力，放到专门打包层处理，而不是复用 TSV/HTML 逻辑硬拼。

## 8. 分阶段实施

### Phase 1: 固定字段模型与样例映射

**目标：** 先围绕目标 note 字段和 `yml_example.yml` 把映射规则确定下来。

**Files:**
- Create: `web/client/src/types/anki.ts`
- Create: `web/client/src/services/ankiFieldMapper.ts`
- Create: `web/client/src/services/ankiExportService.ts`
- Reference: `yml_example.yml`

**任务：**
1. 为固定字段定义类型：
   - `Word`
   - `Context`
   - `notes`
   - `Back`
   - `Add Reverse`
   - `Media`
2. 设计 `yml_example.yml` 到目标字段的默认映射。
3. 统一 `notes` 摘要生成规则。
4. 统一 `Back` 字段的 HTML/富文本来源。

**验收标准：**
- 给定 `yml_example.yml` 可稳定生成一份 note 载荷。
- 目标 6 字段全部有明确来源或兜底逻辑。

**测试：**
- `ankiFieldMapper` 单元测试
- `yml_example.yml` 映射快照测试

### Phase 2: 导出弹窗与动作分发

**目标：** 让独立 `Export` 按钮真正可用。

**Files:**
- Create: `web/client/src/components/AnkiExport/AnkiExportModal.vue`
- Create: `web/client/src/composables/useAnkiExport.ts`
- Modify: `web/client/src/components/WordList/WordActionMenu.vue`
- Modify: `web/client/src/components/WordList/WordList.vue`
- Optional Modify: `web/client/src/components/WordPreview/WordPreview.vue`

**任务：**
1. 保持 `Copy HTML Code (Anki)` 不变。
2. 将菜单里的独立 `Export` 按钮接到新弹窗。
3. 在弹窗中展示：
   - 6 个字段预览
   - 导入到 Anki
   - 导出 `.apkg`
4. 增加动作执行状态与错误反馈。

**验收标准：**
- 点击 `Export` 可打开正式导出弹窗。
- 用户可看到固定字段的预览结果。
- `Copy HTML Code (Anki)` 与 `Export` 职责清晰。

**测试：**
- 弹窗渲染测试
- Export 入口触发测试

### Phase 3: AnkiConnect 集成与 `test` 牌组验证

**目标：** 建立本地直连 Anki 的真实导入能力。

**Files:**
- Create: `web/client/src/services/ankiConnectService.ts`
- Modify: `web/client/src/services/ankiExportService.ts`
- Modify: `web/client/src/composables/useAnkiExport.ts`

**任务：**
1. 封装 AnkiConnect 基本请求能力。
2. 增加连通性检查，如 `version` / `deckNames`。
3. 增加 `test` 牌组检测或创建流程。
4. 将生成的 note 直接导入 `test` 牌组。
5. 返回成功 note id、失败原因等结果。

**验收标准：**
- 本地 Anki 启动且开启 AnkiConnect 时，导入动作可成功执行。
- 目标牌组固定为 `test`。
- 失败时能明确区分：
  - Anki 未启动
  - AnkiConnect 不可达
  - 字段不匹配
  - note model 不存在

**测试：**
- `ankiConnectService` 请求构造测试
- 使用 mock 的联调测试

**手工验证：**
1. 启动 Anki 与 AnkiConnect。
2. 从 `Export` 弹窗执行“导入到 Anki”。
3. 在 `test` 牌组中确认 note 已出现。

### Phase 4: `.apkg` 导出

**目标：** 支持生成可导入的牌组文件。

**Files:**
- Create: `web/client/src/services/apkgExportService.ts` 或等效本地导出桥接层
- Modify: `web/client/src/services/ankiExportService.ts`
- Modify: `web/client/src/composables/useAnkiExport.ts`

**任务：**
1. 选定 `.apkg` 生成方案：
   - 优先现成库
   - 不可行时使用本地 Node 打包脚本
2. 定义 deck name、model name、字段顺序。
3. 将 note 数据写入 `.apkg`。
4. 将 `Media` 字段纳入结构，即使初期为空。
5. 支持浏览器下载或本地生成文件。

**验收标准：**
- 可以生成一个可导入 Anki 的 `.apkg` 文件。
- 字段顺序与目标 note model 一致。
- 使用 `yml_example.yml` 可产出有效样例包。

**测试：**
- `.apkg` 生成结构测试
- deck/model 字段顺序测试

### Phase 5: 设置与可配置项

**目标：** 在固定字段模型稳定后，再开放必要配置。

**Files:**
- Modify: `web/client/src/views/SettingsView.vue`
- Modify or Create: `web/client/src/utils/` 下与配置持久化相关文件

**任务：**
1. 配置以下默认值：
   - note model 名称
   - 默认牌组名称
   - `Add Reverse` 默认值
2. 允许对固定字段来源做有限配置，而不是完全自由映射。
3. 保存到 localStorage。

**验收标准：**
- 用户不需要每次重复填写配置。
- 配置不会破坏目标字段顺序。

**测试：**
- 设置持久化测试
- 默认值加载测试

### Phase 6: 打磨与发布前验证

**目标：** 确保整条导出 / 导入链路可交付。

**Files:**
- Modify: 以上相关文件
- Test: `web/client/src/**/*.test.ts`

**任务：**
1. 完善错误提示。
2. 处理字段缺失兜底。
3. 检查移动端可用性。
4. 明确用户提示文案：
   - `导入到 Anki (test deck)`
   - `下载 .apkg`

**验收标准：**
- `Export` 弹窗可以完成两条真实动作：
  - 导入到 `test`
  - 下载 `.apkg`
- 样例数据 `yml_example.yml` 能走通主链路。

## 9. 测试策略

### 9.1 单元测试

- `ankiFieldMapper`
  - 固定字段映射正确
  - 缺字段时兜底正确

- `ankiExportService`
  - note 结构正确
  - `Back` 字段输出正确
  - `notes` 摘要稳定

- `ankiConnectService`
  - action 请求体正确
  - `test` 牌组逻辑正确

- `apkgExportService`
  - model 字段顺序正确
  - deck 信息正确

### 9.2 组件测试

- `AnkiExportModal.vue`
  - 字段预览渲染正确
  - 点击“导入到 Anki”触发正确动作
  - 点击“下载 .apkg”触发正确动作

### 9.3 手工验证

1. 使用 `yml_example.yml` 对应词条生成导出预览。
2. 确认以下 6 个字段都有值或可接受兜底：
   - `Word`
   - `Context`
   - `notes`
   - `Back`
   - `Add Reverse`
   - `Media`
3. 启动 Anki + AnkiConnect。
4. 通过 `Export` 弹窗导入到 `test` 牌组。
5. 在 Anki 中检查导入结果。
6. 生成 `.apkg` 并手工导入验证。

## 10. 风险与对策

### 风险 1：AnkiConnect 在用户环境不可用

**影响：** 无法完成直接导入。

**对策：**
- 明确检测连接状态
- `.apkg` 导出作为兜底路径

### 风险 2：目标 note model 与字段顺序不匹配

**影响：** 导入后字段错位。

**对策：**
- 固定字段顺序
- 对目标字段做严格映射测试

### 风险 3：`.apkg` 打包方案前端不可行

**影响：** 浏览器侧无法稳定生成包。

**对策：**
- 优先评估现成库
- 如前端方案不稳定，切换为本地 Node 打包脚本或项目内辅助脚本

### 风险 4：`Back` 字段 HTML 过于依赖现有预览渲染

**影响：** 页面改动影响导出结果。

**对策：**
- 独立封装 `Back` 渲染逻辑
- 避免组件直接决定 Anki 背面结构

## 11. 建议提交策略

1. `feat(anki): add fixed field mapping for target note model`
2. `feat(anki): add export modal and export orchestration`
3. `feat(anki): integrate anki-connect for test deck import`
4. `feat(anki): add apkg export pipeline`
5. `test(anki): cover mapping import and apkg flows`

## 12. 最终交付标准

满足以下条件即可视为本计划完成：

- `Copy HTML Code (Anki)` 保持原有核心功能不变
- 独立 `Export` 按钮成为正式 Anki 入口
- 目标字段固定支持：
  - `Word`
  - `Context`
  - `notes`
  - `Back`
  - `Add Reverse`
  - `Media`
- 可以把 note 直接导入本地 Anki 的 `test` 牌组
- 可以导出 `.apkg`
- `yml_example.yml` 可以跑通主验证链路

## 13. 后续扩展

本计划完成后，可继续演进：

1. 支持批量导出多个词条
2. 支持多个 note model
3. 支持媒体真实打包而非占位
4. 支持导入历史记录
5. 支持更多 deck 策略

---

如果按这份计划继续实施，建议顺序是：先把固定字段映射和样例跑通，再做 AnkiConnect 联调，最后补 `.apkg`。这样最容易尽早看到真实可用结果，也最方便定位问题到底出在字段、连接，还是打包阶段。
