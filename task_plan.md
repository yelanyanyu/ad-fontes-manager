# Fix: APKG 导出 `addReverse` 校验错误 + CSS 拉取

> **症状**：单次/批量 APKG 导出返回 400 `"Invalid input: expected boolean, received undefined"`（`payloads[].options.addReverse` 缺失）。
>
> **根因**：后端 Zod schema 要求 `addReverse: z.boolean()` 为必填，但前端从未发送该字段。`addReverse` 应由 Anki 模板自行处理，不在 APKG 导出系统中维护。
>
> **附加**：APKG 导出当前使用硬编码 CSS，应从 AnkiConnect 拉取模型真实的 CSS。

---

## 设计决策（来自 grill session）

| # | 决策 | 选择 |
|---|------|------|
| 1 | `addReverse` 去除范围 | 全量清除（前端 + 后端 + 测试 fixtures） |
| 2 | `shouldIncludeReverse` 死代码 | 删除（无任何调用点） |
| 3 | CSS 从 AnkiConnect 拉取 | 本期实现 |
| 4 | CSS 获取方式 | 独立函数 `getModelStyling(modelName)` |
| 5 | 桌面端下载支持 | 本期不实现（浏览器下载已满足） |
| 6 | AnkiConnect 不可用时 CSS 处理 | 报错，阻止导出 |
| 7 | CSS 获取时机 | Eager（用户选模型时拉取，缓存供批量复用） |
| 8 | 空 CSS 处理 | 接受但 console.warn 提醒用户 |
| 9 | 测试中 `'Add Reverse'` 字段 | 全部删除 |
| 10 | `css` 在类型层级中的位置 | `AnkiApkgExportRequest.css`，与 `selectedTemplate` 并列 |
| 11 | 错误消息格式 | 保留 Zod `flatten()` 结构，额外添加 `message` 摘要 |
| 12 | 实施顺序 | 后端正则先行，再前端，最后测试 |
| 13 | 测试策略 | 修复已有测试 + 新增 `getModelStyling` 单测 + CSS 传递集成断言 |

---

## 实施步骤（自底向上）

### Phase 1：后端（unblock 400 错误）

#### Step 1.1：修复后端 schema —— `web/schemas/requests/ansi.ts`

- 删除 `AnkiExportOptionsSchema` 中的 `addReverse: z.boolean()`
- 删除 `shouldIncludeReverse` 函数及 `extractTemplateFields` 中无关联逻辑
- 新增 `css` 字段：`css: z.string().min(1, 'CSS must not be empty when AnkiConnect is available').optional()`（在 `superRefine` 中校验若非 optional 场景则需要非空——实际：CSS 由前端传入，前端已在 eager 阶段校验 AnkiConnect 可用性，所以后端使用 `z.string()` 强制要求）
- `superRefine` 新增校验：
  - `css` 非空字符串（若前端传了空字符串则拒绝，因为这意味着 AnkiConnect 返回了空但前端没拦截）

**精确变更**：
```ts
// 删除 AnkiExportOptionsSchema 中的 addReverse 行
// 将 addReverse: z.boolean(), 改为（删除该行）

// AnkiExportApkgBodySchema 新增 css 字段
const AnkiExportApkgBodySchema = z.object({
  fileName: OptionalTrimmedString.default('ad-fontes-export.apkg'),
  payloads: z.array(AnkiExportPayloadSchema).min(1, 'payloads must contain at least one item'),
  modelFields: z.array(NonEmptyString).min(1, 'modelFields must contain at least one field'),
  selectedTemplate: AnkiSelectedTemplateSchema,
  css: z.string(),  // 新增：来自 AnkiConnect modelStyling
})
```

#### Step 1.2：修复 apkgService —— `web/services/anki/apkgService.ts`

- 删除 `AnkiExportPayload.options.addReverse` 类型字段
- 删除 `shouldIncludeReverse` 函数（含 `REVERSE_FIELD_TOKEN` 常量）
- `BuildApkgInput` 新增 `css: string`
- `patchDeckAndModelIdentifiers` 接收 `css` 参数，移除 `DEFAULT_CARD_CSS` 回退
- `buildApkgBuffer` 签名新增 `css` 参数并下传

#### Step 1.3：改进校验中间件 —— `web/middleware/validate.ts`

- `parseOrThrow` 中，ZodError 时额外生成 `message` 字段：
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

#### Step 1.4：修复路由 —— `web/routes/core.ts`

- `body` 类型新增 `css: string`
- 将 `body.css` 传入 `buildApkgBuffer`

---

### Phase 2：前端

#### Step 2.1：更新类型 —— `web/client/src/types/ani.ts`

- `AnkiExportOptions` 删除 `addReverse`（整个字段不存在，不需删除）—— 确认当前类型无 `addReverse`（已有类型中无此字段，保持一致）
- `AnkiApkgExportRequest` 新增 `css: string`

#### Step 2.2：新增 CSS 获取 —— `web/client/src/services/ankiConnectService.ts`

- 新增 `getModelStyling`：
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

#### Step 2.3：更新导出服务 —— `web/client/src/services/ankiExportService.ts`

- 确认 `DEFAULT_OPTIONS` 无 `addReverse`（当前代码已无，确认即可）
- 确认 `createAnkiPayload` 不涉及 `addReverse`

#### Step 2.4：更新 APKG 导出服务 —— `web/client/src/services/apkgExportService.ts`

- `downloadApkgViaBackend` 新增 `css: string` 参数
- `requestPayload` 包含 `css`
- 空 CSS 检测：若 `!css.trim()`，`console.warn('Model CSS is empty. The exported .apkg will use Anki default styling.')`，但仍允许导出
- `exportApkgViaAnkiConnect` 新增 `css` 参数并转发
- `exportBatchApkgViaAnkiConnect` 新增 `css` 参数并转发

#### Step 2.5：Composable eager 加载 CSS —— `web/client/src/composables/useAnkiExport.ts`

- 在模型选择后（`onModelSelected` 或类似生命周期）调用 `getModelStyling(modelName)`
- 失败时展示错误并阻止后续导出（与 `getModelFieldNames` 同级处理）
- CSS 存入 composable 状态，导出时传入 `exportApkgViaAnkiConnect`
- 若未连接 AnkiConnect，提示"请先连接 Anki 后再导出"

#### Step 2.6：Batch composable —— `web/client/src/composables/useBatchAnkiExport.ts`

- 同上，eager 加载 CSS，批量导出时复用

---

### Phase 3：测试

#### Step 3.1：修复已有测试 fixtures

以下文件删除所有 `addReverse` 和 `'Add Reverse'` 引用：
- `web/tests/apkg-service.test.ts` — 删除 `addReverse: true` 和 `'Add Reverse': 'true'`
- `web/tests/anki-export-apkg-route.test.ts` — 删除 `addReverse: true` 和 `'Add Reverse'`，新增 `css` 字段
- `web/client/src/composables/useBatchAnkiExport.test.ts` — 删除 `'Add Reverse'`
- `web/client/src/composables/useAnkiExport.test.ts` — 删除 `'Add Reverse'`
- `web/client/src/services/ankiConnectService.test.ts` — 删除 `'Add Reverse'` 和 `options.addReverse` 引用

#### Step 3.2：新增测试

- `ankiConnectService.test.ts`：新增 `getModelStyling` 单测（正常返回 CSS、空 CSS、AnkiConnect 不可用）
- `anki-export-apkg-route.test.ts`：新增 CSS 传递集成断言（验证请求中的 `css` 字段被正确传递到 `buildApkgBuffer` 参数）

---

## 变更文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `web/schemas/requests/anki.ts` | 删除 `addReverse`，新增 `css` |
| 修改 | `web/services/anki/apkgService.ts` | 删除 `addReverse` 类型 + `shouldIncludeReverse`，接收 `css` |
| 修改 | `web/middleware/validate.ts` | 错误消息增加 `message` 摘要 |
| 修改 | `web/routes/core.ts` | 传递 `css` 到 `buildApkgBuffer` |
| 修改 | `web/client/src/types/anki.ts` | `AnkiApkgExportRequest` 新增 `css` |
| 修改 | `web/client/src/services/ankiConnectService.ts` | 新增 `getModelStyling` |
| 修改 | `web/client/src/services/ankiExportService.ts` | 确认无 `addReverse` 残留 |
| 修改 | `web/client/src/services/apkgExportService.ts` | 传递 `css`，空 CSS 警告 |
| 修改 | `web/client/src/composables/useAnkiExport.ts` | Eager CSS 加载 |
| 修改 | `web/client/src/composables/useBatchAnkiExport.ts` | Eager CSS 加载 |
| 修改 | `web/tests/apkg-service.test.ts` | 删除 `addReverse` / `'Add Reverse'` |
| 修改 | `web/tests/anki-export-apkg-route.test.ts` | 同上 + 新增 CSS 断言 |
| 修改 | `web/client/src/composables/useBatchAnkiExport.test.ts` | 删除 `'Add Reverse'` |
| 修改 | `web/client/src/composables/useAnkiExport.test.ts` | 删除 `'Add Reverse'` |
| 修改 | `web/client/src/services/ankiConnectService.test.ts` | 删除 `'Add Reverse'` + 新增 `getModelStyling` 单测 |

## 不涉及的文件

- `web/client/src/components/AnkiExport/AnkiExportModal.vue`（UI 已无 addReverse 勾选框）
- `web/client/src/components/AnkiExport/BatchAnkiExportModal.vue`（同上）
- `web/client/src/services/ankiFieldMapper.ts`（字段映射逻辑不变）
- `web/client/src/services/ankiFieldMappingStore.ts`（映射存储不变）
- `web/client/src/services/ankiPayloadBuilder.ts`（payload 构建不变）
- `web/client/src/stores/batchAnkiStore.ts`（batch 状态不变）
- `web/client/src/utils/generator.ts`（generateCardHTML 不变）
- `web/client/src/services/ankiExportOptionsStore.ts`（旧选项存储不动）
