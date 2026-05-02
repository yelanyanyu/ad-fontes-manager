# Fix: APKG 导出 Bug 修复 + CSS 拉取 + 全量导出

> **状态**：hotfix 已部分就位（schema 修复、body limit 提升），剩余工作见 Phase 1-4。

---

## 已完成的 Hotfix

以下修复已在 grill session 中直接应用到代码：

| 修复 | 文件 | 变更 |
|------|------|------|
| 删除 `addReverse` 必填校验 | `web/schemas/requests/anki.ts` | 移除 `addReverse: z.boolean()` |
| 新增 `css` 字段 | `web/schemas/requests/anki.ts` | `css: z.string().min(1, ...)` |
| 修复 `extractTemplateFields` — `^` 前缀 | `web/schemas/requests/anki.ts` | 正则 `/^[#/^]/` 增加 `^` |
| 跳过 Anki 系统字段 | `web/schemas/requests/anki.ts` | `ANKI_SPECIAL_FIELDS` set（FrontSide, Deck, Subdeck, Tags, Type, Card, CardFlag） |
| 处理修饰符关键字 | `web/schemas/requests/anki.ts` | `ANKI_FIELD_MODIFIERS` set（hint, clickable）→ 取冒号右侧为真实字段名 |
| 取消 payload 必须包含全部模板字段的要求 | `web/schemas/requests/anki.ts` | 删除 `superRefine` 中 per-field 必填校验（未映射字段由 apkgService 填空字符串） |
| JSON body limit 100KB → 50MB | `web/server.ts` | `express.json({ limit: '50mb' })` |

---

## 设计决策

| # | 决策 | 选择 |
|---|------|------|
| 1 | `addReverse` 去除范围 | 全量清除（前端 + 后端 + 测试） |
| 2 | `shouldIncludeReverse` 死代码 | 删除 |
| 3 | CSS 来源 | AnkiConnect `modelStyling` API |
| 4 | CSS 获取方式 | 独立函数 `getModelStyling(modelName)` |
| 5 | CSS 获取时机 | Eager（选模型时拉取，批量复用） |
| 6 | AnkiConnect 不可用 | 报错，阻止导出 |
| 7 | 空 CSS | 接受但 `console.warn` |
| 8 | `css` 类型位置 | `AnkiApkgExportRequest.css`，与 `selectedTemplate` 并列 |
| 9 | 错误消息格式 | 保留 Zod `flatten()` + `message` 摘要 |
| 10 | 模板字段未映射 | 填空字符串（不阻止导出） |
| 11 | 全量/大批量导出 | 新增 `POST /api/anki/export-apkg-by-ids`（后端驱动） |
| 12 | 字段提取逻辑 | 在 `web/services/anki/fieldExtractor.ts` 中复制一份（纯函数，无浏览器 API 依赖） |

---

## Phase 1：后端 —— 完成 CSS 管道 + 清理死代码

### Step 1.1：修复 apkgService —— `web/services/anki/apkgService.ts`

- 删除 `AnkiExportPayload.options.addReverse` 类型字段
- 删除 `shouldIncludeReverse` 函数 + `REVERSE_FIELD_TOKEN` 常量
- `BuildApkgInput` 新增 `css: string`
- `patchDeckAndModelIdentifiers` 移除 `model.css || DEFAULT_CARD_CSS`，直接使用传入的 `css`
- 删除 `DEFAULT_CARD_CSS` 常量
- `buildApkgBuffer` 接收并传递 `css`

### Step 1.2：改进校验中间件 —— `web/middleware/validate.ts`

`parseOrThrow` 中为 ZodError 添加 `message` 摘要字段：
```ts
const flattened = result.error.flatten();
const issueMessages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
const message = issueMessages.length > 0
  ? issueMessages.join('; ')
  : 'Validation failed';
throw BadRequest(message, {
  code: 'VALIDATION_ERROR',
  details: flattened,
});
```

### Step 1.3：路由传递 CSS —— `web/routes/core.ts`

- `body` 解构新增 `css: string`
- 将 `body.css` 传入 `buildApkgBuffer`

---

## Phase 2：前端 —— CSS 拉取 + 管道

### Step 2.1：更新类型 —— `web/client/src/types/anki.ts`

- `AnkiApkgExportRequest` 新增 `css: string`
- 新增 `AnkiApkgExportByIdsRequest` 类型（用于 Phase 4）：
```ts
export interface AnkiApkgExportByIdsRequest {
  wordIds: string[];
  fieldMapping: FieldMappingConfig;
  options: AnkiExportOptions;
  modelFields: string[];
  selectedTemplate: AnkiModelTemplate;
  css: string;
  fileName?: string;
}
```

### Step 2.2：新增 CSS 获取 —— `web/client/src/services/ankiConnectService.ts`

```ts
export const getModelStyling = async (modelName: string): Promise<string> => {
  const result = await invoke<{ css: string }>({
    action: 'modelStyling',
    version: ANKI_CONNECT_VERSION,
    params: { modelName },
  });
  return result.css;
};
```

### Step 2.3：确认导出服务无 addReverse —— `web/client/src/services/ankiExportService.ts`

- `DEFAULT_OPTIONS` 和 `createAnkiPayload` 不涉及 `addReverse`（确认即可）

### Step 2.4：APKG 导出服务传递 CSS —— `web/client/src/services/apkgExportService.ts`

- `downloadApkgViaBackend` 新增 `css: string` 参数
- `requestPayload` 包含 `css`
- 空 CSS 时 `console.warn`，但仍允许导出
- `exportApkgViaAnkiConnect` 和 `exportBatchApkgViaAnkiConnect` 新增 `css` 参数
- 新增 `exportApkgByIds` 函数（用于 Phase 4）

### Step 2.5：Composable eager 加载 CSS —— `web/client/src/composables/useAnkiExport.ts`

- 选模型后调用 `getModelStyling(modelName)`
- 失败时展示错误，阻止导出
- CSS 存入状态，导出时传入

### Step 2.6：Batch composable —— `web/client/src/composables/useBatchAnkiExport.ts`

- 同上，eager 加载 CSS，批量导出复用

---

## Phase 3：测试

### Step 3.1：修复已有测试

删除 `addReverse`、`'Add Reverse'`、应删除 `shouldIncludeReverse` 相关断言：

- `web/tests/apkg-service.test.ts`
- `web/tests/anki-export-apkg-route.test.ts`（新增 `css` 字段到测试请求体）
- `web/client/src/composables/useBatchAnkiExport.test.ts`
- `web/client/src/composables/useAnkiExport.test.ts`
- `web/client/src/services/ankiConnectService.test.ts`

### Step 3.2：新增测试

- `ankiConnectService.test.ts`：`getModelStyling` 单测（正常返回 CSS、空 CSS、AnkiConnect 不可用抛错）
- `anki-export-apkg-route.test.ts`：CSS 传递集成断言

---

## Phase 4：全量导出 —— 后端驱动端点

> 动机：当前前端→后端架构需要将全部 word 数据放入 JSON body，10,000 词 ≈ 300MB+。改为前端只发 wordIds，后端从 SQLite 取数据。

### Step 4.1：新建字段提取模块 —— `web/services/anki/fieldExtractor.ts`

从 `web/client/src/utils/generator.ts` 和 `web/client/src/services/ankiFieldMapper.ts` 复制以下纯函数（零浏览器 API）：

- `getByPath`, `toText`
- `extractLemma`, `extractUserContextSentence`, `extractOtherCommonMeanings`
- `extractSelectedExamplesSentence`, `extractSelectedExamplesTranslation`
- `extractSynonymsWord`, `extractSynonymsMeaning`
- `extractRenderedHtml` → 调用复制的 `generateCardHTML`
- `extractBySource(source, data)`
- `buildAnkiFields(data, mapping)`
- `generateCardHTML(data)` 完整复制（含所有 render 辅助函数）

### Step 4.2：新建路由 —— `POST /api/anki/export-apkg-by-ids`

在 `web/routes/core.ts` 新增路由：

**请求体**：
```json
{
  "wordIds": ["uuid1", "uuid2", ...],
  "fieldMapping": [
    { "source": "lemma", "target": "Word" },
    { "source": "rendered_html", "target": "Back" }
  ],
  "options": {
    "deckName": "My Deck",
    "modelName": "AdFontesWord",
    "tags": []
  },
  "modelFields": ["Word", "Back", "Media", ...],
  "selectedTemplate": { "name": "Card 1", "front": "...", "back": "..." },
  "css": "h1 { color: red; }",
  "fileName": "optional-name.apkg"
}
```

**后端逻辑**：
1. Zod 校验请求体
2. `getSqlite()` 查询 `words_v2` 表 `WHERE id IN (...)` 
3. 每个 word 的 `content`（已解析的 YAML Object）传入 `buildAnkiFields(content, fieldMapping)`
4. 组装 `AnkiExportPayload[]`
5. 调用 `buildApkgBuffer({ payloads, modelFields, selectedTemplate, css })`
6. 返回 APKG blob

**Zod Schema**（新建或内联）：
```ts
const AnkiExportApkgByIdsBodySchema = z.object({
  fileName: OptionalTrimmedString.default('ad-fontes-export.apkg'),
  wordIds: z.array(z.string().min(1)).min(1, 'wordIds must contain at least one id'),
  fieldMapping: z.array(z.object({
    source: z.enum([...8 data sources...]),
    target: NonEmptyString,
  })),
  options: AnkiExportOptionsSchema,
  modelFields: z.array(NonEmptyString).min(1),
  selectedTemplate: AnkiSelectedTemplateSchema,
  css: z.string(),
});
```

### Step 4.3：前端导出函数 —— `web/client/src/services/apkgExportService.ts`

```ts
export const exportApkgByIds = async (
  wordIds: string[],
  fieldMapping: FieldMappingConfig,
  options: AnkiExportOptions,
  modelFields: string[],
  selectedTemplate: AnkiModelTemplate,
  css: string,
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  const requestPayload: AnkiApkgExportByIdsRequest = {
    wordIds,
    fieldMapping,
    options,
    modelFields,
    selectedTemplate,
    css,
    fileName: sanitizeFileName(outputFileName),
  };
  const apkgBlob = await request.post<Blob>('/anki/export-apkg-by-ids', requestPayload, {
    responseType: 'blob',
    skipErrorToast: true,
  });
  const validZip = await hasZipEocdSignature(apkgBlob);
  if (!validZip) throw new Error('Downloaded .apkg is invalid (missing ZIP EOCD).');
  triggerBrowserDownload(apkgBlob, sanitizeFileName(outputFileName));
  return { ok: true, fileName: sanitizeFileName(outputFileName) };
};
```

### Step 4.4：Composable 切换 —— `useBatchAnkiExport.ts`

- 大批量（如 > 100 条）自动使用 `exportApkgByIds` 路径
- 小批量保留现有 `exportBatchApkgViaAnkiConnect` 路径

---

## 变更文件清单

| 操作 | 文件 | Phase |
|------|------|-------|
| 修改 | `web/services/anki/apkgService.ts` | 1 |
| 修改 | `web/middleware/validate.ts` | 1 |
| 修改 | `web/routes/core.ts` | 1 + 4 |
| 修改 | `web/client/src/types/anki.ts` | 2 |
| 修改 | `web/client/src/services/ankiConnectService.ts` | 2 |
| 确认 | `web/client/src/services/ankiExportService.ts` | 2 |
| 修改 | `web/client/src/services/apkgExportService.ts` | 2 + 4 |
| 修改 | `web/client/src/composables/useAnkiExport.ts` | 2 |
| 修改 | `web/client/src/composables/useBatchAnkiExport.ts` | 2 + 4 |
| **新建** | `web/services/anki/fieldExtractor.ts` | 4 |
| 修改 | `web/tests/apkg-service.test.ts` | 3 |
| 修改 | `web/tests/anki-export-apkg-route.test.ts` | 3 |
| 修改 | `web/client/src/composables/useBatchAnkiExport.test.ts` | 3 |
| 修改 | `web/client/src/composables/useAnkiExport.test.ts` | 3 |
| 修改 | `web/client/src/services/ankiConnectService.test.ts` | 3 |
| 修改 | `web/server.ts` | ✅ done |

## 不涉及的文件

- `web/client/src/components/AnkiExport/`（UI 不变）
- `web/client/src/services/ankiFieldMapper.ts`（前端提取逻辑保留，不做共享模块重构）
- `web/client/src/services/ankiFieldMappingStore.ts`
- `web/client/src/services/ankiPayloadBuilder.ts`
- `web/client/src/stores/batchAnkiStore.ts`
- `web/client/src/utils/generator.ts`（前端 HTML 生成保留）
- `web/client/src/services/ankiExportOptionsStore.ts`
- `web/schemas/requests/anki.ts`（schema hotfix 已完成）✅ done
