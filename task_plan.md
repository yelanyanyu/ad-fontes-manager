# Anki 字段映射可配置化

> **目标**：让用户自定义 YAML 数据源 → Anki 卡片模板字段的映射关系，替代当前硬编码的 `DEFAULT_ANKI_FIELD_MAPPING`。

## 设计决策汇总

### 1. 数据源（8 个）

| Source ID | YAML 路径 | 渲染格式 |
|-----------|-----------|----------|
| `lemma` | `yield.lemma` | 纯文本 |
| `user_context_sentence` | `yield.user_context_sentence` | 纯文本 |
| `other_common_meanings` | `yield.other_common_meanings` | `\|\|` 连接 |
| `selected_examples_sentence` | `application.selected_examples[].sentence` | `\|\|` 连接 |
| `selected_examples_translation` | `application.selected_examples[].translation_zh` | `\|\|` 连接 |
| `synonyms_word` | `nuance.synonyms[].word` | `\|\|` 连接 |
| `synonyms_meaning` | `nuance.synonyms[].meaning_zh` | `\|\|` 连接 |
| `rendered_html` | 完整 YAML → `generateCardHTML(data)` | 完整卡片 HTML |

- YAML 数据缺失/为空时，对应 Anki 字段写空字符串。
- `addReverse` 功能完全移除（翻转卡片由用户在 Anki 模板中自行处理）。

### 2. 存储 Schema

- 存储位置：localStorage，**新 key** `anki_field_mappings`（不动旧的 `anki_export_options`）。
- 作用域：**按模型名（modelName）** 存储，key 为用户在 Anki 中选的模型名（动态获取，非硬编码）。
- 格式：**数组**，兼容 key-value 对象读取。

```json
{
  "Basic": [
    { "source": "lemma", "target": "Front" },
    { "source": "rendered_html", "target": "Back" }
  ],
  "AdFontesWord": [
    { "source": "lemma", "target": "Word" },
    { "source": "user_context_sentence", "target": "Context" },
    { "source": "rendered_html", "target": "Back" },
    { "source": "synonyms_word", "target": "Synonyms" },
    { "source": "selected_examples_sentence", "target": "Example" }
  ]
}
```

读取时兼容旧 key-value 对象格式：`{ "lemma": "Word" }` → 自动转为 `[{ "source": "lemma", "target": "Word" }]`。

### 3. 推荐映射（向后兼容）

- 选模型后检测其字段名是否匹配旧预设 `Word`, `Context`, `Back` 中的任意一个。
- 若匹配，提供一键"使用推荐映射"按钮。
- 推荐映射规则：
  - `lemma → Word`（如果模型有 `Word` 字段）
  - `user_context_sentence → Context`（如果模型有 `Context` 字段）
  - `rendered_html → Back`（如果模型有 `Back` 字段）
- 用户可接受或忽略。

### 4. UI 组件

- **共享 Vue 组件** `AnkiFieldMappingEditor.vue`，在 `AnkiExportModal` 和 `BatchAnkiExportModal` 中复用。
- 交互形态：**表格行** —— 左侧 Anki 字段名（只读标签，来自 `modelFieldNames`），右侧数据源下拉选择器（9 个选项：8 个数据源 + "不映射"）。
- **滚动要求**：外层容器（弹窗 body）可滚动 → 容纳长页面；内层 table 也可独立滚动 → 字段多时表头固定。
- 保存时机：**自动保存**（每次下拉改变立即写入 localStorage）+ **重置按钮**（恢复推荐映射或清空）。

### 5. 模型管理

- **删除** `ensureModelExists` 及其全部逻辑（自动创建模型、字段、CSS、卡片模板）。
- **保留** `ensureDeckExists`（牌组创建无副作用）。
- 用户必须在 Anki 中自行创建模型和字段，本工具只负责填入数据。

### 6. AnkiConnect 依赖

- 字段映射配置**必须**先连接 AnkiConnect（需要 `modelFieldNames` 获取字段列表）。
- 未连接时弹窗显示"请先连接 Anki 后再配置字段映射"，**同时保留已有的刷新/重连按钮**。

### 7. .apkg 导出

- .apkg 导出时从 AnkiConnect 实时拉取模型的字段列表、CSS、模板 HTML。
- **注意**：apkg 模块当前有问题，将在之后单独修复。本期不对 apkg 做改动。

---

## 实现步骤（自底向上）

### Step 1：更新类型定义

**文件**：`web/client/src/types/anki.ts`

- 删除 `AnkiFieldRole`、`AnkiCanonicalFields`、`AnkiFieldMapping`。
- 新增：

```ts
export type AnkiDataSource =
  | 'lemma'
  | 'user_context_sentence'
  | 'other_common_meanings'
  | 'selected_examples_sentence'
  | 'selected_examples_translation'
  | 'synonyms_word'
  | 'synonyms_meaning'
  | 'rendered_html';

export interface FieldMappingEntry {
  source: AnkiDataSource;
  target: string; // Anki 字段名（动态，来自 modelFieldNames）
}

export type FieldMappingConfig = FieldMappingEntry[];

// 兼容旧格式
export type LegacyFieldMappingConfig = Record<string, string>;
```

- `AnkiExportPayload` 中 `fieldMapping?` 类型从 `AnkiFieldMapping` 改为 `FieldMappingConfig`。
- `AnkiExportOptions` 中删除 `addReverse`。
- 删除 `AnkiCanonicalFields`。

### Step 2：重写字段提取逻辑

**文件**：`web/client/src/services/ankiFieldMapper.ts`

- 删除 `DEFAULT_ANKI_FIELD_MAPPING`、`buildCanonicalAnkiFields`、`mapCanonicalFieldsToAnkiFields`、`mapWordToAnkiFields`。
- 新增 8 个独立提取函数：

```ts
const extractLemma = (data: UnknownRecord): string =>
  toText(getByPath(data, 'yield.lemma'));

const extractUserContextSentence = (data: UnknownRecord): string =>
  toText(getByPath(data, 'yield.user_context_sentence'));

const extractOtherCommonMeanings = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'yield.other_common_meanings');
  return Array.isArray(arr) ? arr.map(String).join('||') : '';
};

const extractSelectedExamplesSentence = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr.map(e => toText((e as UnknownRecord)?.sentence)).filter(Boolean).join('||')
    : '';
};

const extractSelectedExamplesTranslation = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr.map(e => toText((e as UnknownRecord)?.translation_zh)).filter(Boolean).join('||')
    : '';
};

const extractSynonymsWord = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr.map(s => toText((s as UnknownRecord)?.word)).filter(Boolean).join('||')
    : '';
};

const extractSynonymsMeaning = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr.map(s => toText((s as UnknownRecord)?.meaning_zh)).filter(Boolean).join('||')
    : '';
};

const extractRenderedHtml = (data: UnknownRecord): string =>
  generateCardHTML(data);
```

- 新增聚合函数：

```ts
export const buildAnkiFields = (
  data: UnknownRecord,
  mapping: FieldMappingConfig
): AnkiTargetFields => {
  const fields: AnkiTargetFields = {};
  for (const { source, target } of mapping) {
    fields[target] = extractBySource(source, data);
  }
  return fields;
};
```

- `extractBySource(source, data)` 做 source → 提取函数的 dispatch。
- 保留 `getByPath`、`toText` 工具函数。

### Step 3：更新导出服务

**文件**：`web/client/src/services/ankiExportService.ts`

- 删除 `DEFAULT_ANKI_FIELD_MAPPING` 引用。
- `createAnkiPayload` 接受 `fieldMapping: FieldMappingConfig` 参数。
- 删除 `addReverse` 相关逻辑。
- `sourceLemma` 查找逻辑从 `fields[fieldMapping.word]` 改为在所有已映射的 target 中找 lemma 值（或直接用 `extractLemma`）。
- 删除 `import { DEFAULT_ANKI_FIELD_MAPPING, mapWordToAnkiFields }`。

### Step 4：更新 AnkiConnect 服务

**文件**：`web/client/src/services/ankiConnectService.ts`

- 删除 `DEFAULT_ANKI_FIELD_MAPPING` 引用。
- 删除 `ensureModelExists` 函数（整个函数 + 调用点）。
- `resolveFieldMapping` → 不再有默认 fallback，直接读 `payload.fieldMapping`。
- `getPayloadWordFieldName` → 在 fieldMapping 中找 source 为 `lemma` 的 entry，返回其 target。
- `prepareAnkiTarget` 中移除 `ensureModelExists` 调用，只保留 `ensureDeckExists`。

### Step 5：更新 Payload Builder

**文件**：`web/client/src/services/ankiPayloadBuilder.ts`

- `buildExportPayload` 接受 `fieldMapping: FieldMappingConfig` 参数并下传给 `createAnkiPayload`。

### Step 6：新增映射配置持久化 Store

**新建文件**：`web/client/src/services/ankiFieldMappingStore.ts`

```ts
const STORAGE_KEY = 'anki_field_mappings';

// 读取（兼容旧格式）
export const loadFieldMapping = (modelName: string): FieldMappingConfig => { ... }

// 保存（自动触发于每次用户选择）
export const saveFieldMapping = (modelName: string, mapping: FieldMappingConfig): void => { ... }

// 获取推荐映射（检测字段名匹配旧预设）
export const getRecommendedMapping = (modelFieldNames: string[]): FieldMappingConfig => { ... }

// 删除某模型的映射
export const removeFieldMapping = (modelName: string): void => { ... }
```

- 读取逻辑：先尝试新数组格式，若为对象（旧格式）则自动转换。
- 推荐映射逻辑：遍历旧预设 `{ lemma: 'Word', user_context_sentence: 'Context', rendered_html: 'Back' }`，只保留 target 在 `modelFieldNames` 中存在的条目。

### Step 7：创建共享字段映射编辑组件

**新建文件**：`web/client/src/components/AnkiExport/AnkiFieldMappingEditor.vue`

Props:
- `modelName: string`
- `modelFieldNames: string[]`
- `modelValue: FieldMappingConfig` (v-model)

Emits:
- `update:modelValue`

模板结构：
```html
<div class="field-mapping-editor"><!-- 外层容器，overflow-y: auto -->
  <div class="field-mapping-header">
    <span>字段映射</span>
    <button @click="resetToRecommended">重置为推荐映射</button>
    <button @click="clearAll">清空全部</button>
  </div>
  <div class="field-mapping-table-wrapper"><!-- 内层 table 容器，overflow-y: auto，max-height -->
    <table>
      <thead>
        <tr><th>Anki 字段</th><th>数据源</th></tr>
      </thead>
      <tbody>
        <tr v-for="fieldName in modelFieldNames" :key="fieldName">
          <td>{{ fieldName }}</td>
          <td>
            <select
              :value="getMappingFor(fieldName)"
              @change="setMapping(fieldName, $event.target.value)"
            >
              <option value="">不映射</option>
              <option v-for="source in dataSources" :key="source.id" :value="source.id">
                {{ source.label }}
              </option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

- `getMappingFor(fieldName)` 在当前 mapping 中找 target === fieldName 的 entry。
- `setMapping(fieldName, source)` 自动保存到 localStorage（auto-save）。
- 下拉改变时 emit `update:modelValue`。

### Step 8：集成到两个弹窗

**文件**：`web/client/src/components/AnkiExport/AnkiExportModal.vue`

- 引入 `AnkiFieldMappingEditor`。
- 在"目标字段预览"区域替换为映射编辑器。
- 删除 addReverse 勾选框。
- 弹窗 body 确保 `overflow-y: auto`。

**文件**：`web/client/src/components/AnkiExport/BatchAnkiExportModal.vue`

- 同上，引入映射编辑器。
- 删除 addReverse 相关选项。

### Step 9：更新 composables

**文件**：`web/client/src/composables/useAnkiExport.ts`

- `refreshPayload` 中传递 `fieldMapping` 给 `buildExportPayload`。
- 连接 AnkiConnect 后加载当前模型的字段映射。
- 如果未连接，提示用户连接（保留刷新按钮）。
- 删除 `addReverse` 相关逻辑。

**文件**：`web/client/src/composables/useBatchAnkiExport.ts`

- 同上。

### Step 10：更新测试

- `ankiFieldMapper.test.ts`：重写，测试 8 个提取函数 + `buildAnkiFields`。
- `ankiPayloadBuilder.test.ts`：适配新 fieldMapping 参数。
- `ankiConnectService.test.ts`：删除 ensureModelExists 相关测试，适配 findNotes query 中 field name 查找。
- `ankiExportService.test.ts`：删除 addReverse 测试，适配新 fieldMapping。
- `useAnkiExport.test.ts`、`useBatchAnkiExport.test.ts`：适配。

---

## 变更文件清单

| 操作 | 文件 |
|------|------|
| 修改 | `web/client/src/types/anki.ts` |
| 重写 | `web/client/src/services/ankiFieldMapper.ts` |
| 修改 | `web/client/src/services/ankiExportService.ts` |
| 修改 | `web/client/src/services/ankiConnectService.ts` |
| 修改 | `web/client/src/services/ankiPayloadBuilder.ts` |
| **新建** | `web/client/src/services/ankiFieldMappingStore.ts` |
| **新建** | `web/client/src/components/AnkiExport/AnkiFieldMappingEditor.vue` |
| 修改 | `web/client/src/components/AnkiExport/AnkiExportModal.vue` |
| 修改 | `web/client/src/components/AnkiExport/BatchAnkiExportModal.vue` |
| 修改 | `web/client/src/composables/useAnkiExport.ts` |
| 修改 | `web/client/src/composables/useBatchAnkiExport.ts` |
| 修改 | `web/client/src/services/ankiFieldMapper.test.ts` |
| 修改 | `web/client/src/services/ankiPayloadBuilder.test.ts` |
| 修改 | `web/client/src/services/ankiConnectService.test.ts` |
| 修改 | `web/client/src/services/ankiExportService.test.ts` |
| 修改 | `web/client/src/composables/useAnkiExport.test.ts` |
| 修改 | `web/client/src/composables/useBatchAnkiExport.test.ts` |

## 不涉及的文件

- `web/routes/core.ts`（AnkiConnect 中继，不改）
- `web/services/anki/apkgService.ts`（.apkg 暂不修复）
- `web/client/src/utils/generator.ts`（generateCardHTML 逻辑不变）
- `web/client/src/services/ankiExportOptionsStore.ts`（旧选项存储不动）
- `web/client/src/stores/batchAnkiStore.ts`（batch 状态管理不动）
- `web/schemas/requests/anki.ts`（后端校验不动）
