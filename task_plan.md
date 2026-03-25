<br />

# Zod 集成实施计划 V2

## 目标

在不破坏当前业务流程的前提下，将项目中的输入校验逐步迁移到 Zod，优先解决 **API 请求边界、配置解析、类型收敛** 三类问题，并为后续 Better Auth、权限系统和类型统一提供稳定基础。

本计划**不追求一次性用 Zod 替换全部现有验证逻辑**。\
尤其是 `WordValidator.ts`，在本阶段不作为“直接替换目标”，而作为**兼容迁移对象**处理。

***

## 调整后的总体策略

### 旧思路

- 先定义完整 `WordSchema`
- 再重写 `WordValidator.ts`
- 再做类型统一

### 新思路

- **先做 API 边界验证**
- **再做配置验证**
- **再抽公共 schema**
- **最后兼容迁移** **`WordValidator`**

### 原因

当前项目更需要的是：

- 让非法请求尽早在 route / middleware 层被拦截
- 让后续 Better Auth / 权限系统接入时，请求边界更干净
- 避免过早重写 `WordValidator` 导致 YAML 业务验证和同步逻辑一起被扰动

所以 Zod 第一阶段的落点应当是：\
**Express 请求边界，而不是复杂领域对象中心。**

***

# 实施阶段

***

## Phase 1：安装依赖与建立验证基础设施

### 目标

安装 Zod，并建立统一的 schema 目录和验证中间件，为后续 API 校验接入做准备。

### 任务清单

- 在 `web/package.json` 中添加 `zod`
- 创建 `web/schemas/` 目录结构
- 创建 `web/middleware/validate.ts`
- 创建 `web/schemas/common.ts`
- 创建 `web/schemas/index.ts`

### 推荐目录结构

```
web/
  schemas/
    common.ts
    index.ts
    requests/
      words.ts
      sync.ts
      auth.ts
    config.ts
    word.ts
  middleware/
    validate.ts

```

### 文件变更

- `web/package.json`
- 新建 `web/schemas/common.ts`
- 新建 `web/schemas/index.ts`
- 新建 `web/middleware/validate.ts`

### 说明

本阶段不要先写完整 `WordSchema`，先把通用能力搭起来：

- `NonEmptyString`
- `UUIDSchema`
- `PaginationSchema`
- `SortSchema`
- 基础数组 / 字符串 helper

***

## Phase 2：优先接入 API 请求边界验证

### 目标

先把 Zod 用在 **高价值、低风险** 的位置：Express 的 `body / query / params` 校验。

### 为什么优先做这个

这是当前最能立刻提升稳定性的部分：

- 能拦截非法输入
- 能让错误结构统一
- 对后续 Phase 0 安全基线和 Better Auth 接入有直接帮助
- 比直接改 `WordValidator` 风险低很多

### 任务清单

#### 2.1 创建通用验证中间件

在 `web/middleware/validate.ts` 中提供：

- `validateBody(schema)`
- `validateQuery(schema)`
- `validateParams(schema)`

### 规则

- 中间件内部统一使用 `safeParse`
- 解析成功后，将解析后的值写回 `req.body / req.query / req.params`
- 解析失败时，**抛出**现有错误体系中的 `BadRequest`
- 不要在中间件中直接 `res.status(400).json(...)`

### 推荐模式

```
const result = schema.safeParse(req.body);

if (!result.success) {
  throw BadRequest('Validation failed', {
    code: 'VALIDATION_ERROR',
    details: result.error.flatten(),
  });
}

req.body = result.data;

```

#### 2.2 为高风险路由补 schema

优先处理以下路径：

- `routes/words.ts`
- `routes/sync.ts`
- 与写操作相关的核心端点

### 应优先覆盖的内容

- `POST /words`
- `POST /words/add`
- `PUT /words/:id`
- sync 相关 body / params / query
- 任何影响数据库写入的关键 API

### 文件变更

- 新建 `web/schemas/requests/words.ts`
- 新建 `web/schemas/requests/sync.ts`
- 修改 `web/routes/words.ts`
- 修改 `web/routes/sync.ts`
- 修改 `web/middleware/validate.ts`

### 完成标准

- 至少一批关键写接口已经接入 Zod 中间件
- 非法 body/query/params 会被统一拦截
- 错误响应通过现有全局错误处理中间件输出，而不是在路由中手写

***

## Phase 3：配置与环境变量验证

### 目标

把配置解析迁移到 Zod，保证服务启动时即发现无效配置。

### 为什么放在 API 之后

配置验证虽然重要，但它不是当前最高风险入口。\
相比之下，请求边界验证更能立刻减少线上和开发期错误。

### 任务清单

- 创建 `web/schemas/config.ts`
- 为配置对象建立 Zod schema
- 在 `config.ts` 或配置加载模块中使用 `safeParse` / `parse`
- 区分开发环境和生产环境的约束

### 注意事项

不要写得过于理想化，避免把真实环境配置误杀。

#### 需要调整的示例

不建议直接写成：

```
host: z.string().ip()
databaseUrl: z.string().startsWith('postgresql://')

```

更合理的方式是：

- `host`: 允许 `localhost`、`0.0.0.0`、域名、IP
- `databaseUrl`: 用 `url()` + `refine()` 判断协议
- `corsOrigins`: 允许开发环境本地地址
- `ADMIN_TOKEN`: 可按环境决定是否必填

### 文件变更

- 新建 `web/schemas/config.ts`
- 修改配置加载文件

### 完成标准

- 启动时能明确报告配置错误
- 配置验证与环境差异兼容
- 不因 schema 过严导致本地和 CI 启动失败

***

## Phase 4：抽公共 schema 与共享边界类型

### 目标

将可复用的基础 schema 抽出来，统一边界层类型，减少类型定义分散。

### 当前问题

你已经指出现在类型定义分散在：

- `web/client/src/types/word-*.ts`
- `WordService.ts`
- `WordAssembler.ts`

这说明 Zod 的价值不只在验证，还在于让“边界类型”收敛。

### 任务清单

- 抽取公共 schema：
  - `NonEmptyString`
  - `UUIDSchema`
  - 分页 / 排序 schema
  - 基础响应 schema
- 为一部分明确的边界对象导出类型
- 评估哪些 schema 适合前后端共享

### 共享原则

**只共享边界 schema，不共享后端内部领域模型。**

适合共享：

- 请求参数
- 基础响应对象
- 分页结构
- 某些表单提交结构

不建议直接共享：

- 完整数据库实体
- 后端 service 内部模型
- 带大量业务逻辑的 schema

### 文件变更

- `web/schemas/common.ts`
- `web/schemas/index.ts`
- 必要时新增 `shared/schemas/`

### 完成标准

- 公共 schema 不再散落定义
- 一部分类型由 `z.infer` 统一导出
- 前后端共享边界清晰，不相互绑死

***

## Phase 5：`WordValidator` 兼容迁移（不是直接替换）

### 目标

为 Word YAML 数据建立 Zod schema，但不把“彻底替换现有 `WordValidator`”作为本阶段硬目标。

### 这一步为什么要保守

因为 `WordValidator.ts` 很可能不仅做了结构校验，还承载了：

- YAML 语义规则
- 多字段关系校验
- 与同步/组装流程耦合的规则
- 错误消息兼容要求

因此更稳的做法是：

### 新职责划分

#### Zod 负责

- 结构校验
- 基础字段约束
- 数组最小长度
- 必填字段
- 非空字符串
- 嵌套对象结构

#### `WordValidator` / 领域层继续负责

- `yield.lemma` 与 `wordLower` 的匹配
- 多字段之间的上下文关系
- YAML 特有语义约束
- 与业务流程强绑定的规则

### 任务清单

1. 在 `web/schemas/word.ts` 中定义 Word 相关 schema
2. 优先建立“输入层 schema”，而不是一开始就覆盖所有领域语义
3. 将 `WordValidator.ts` 改为：
   - 先调用 `WordSchema.safeParse`
   - 再执行原有额外业务校验
   - 最终保持原有 `validate(data, wordLower)` 接口兼容
4. 保持原错误消息格式尽量兼容
5. 增加 Zod error 到旧错误数组格式的转换器

### 修改后的定位

旧描述：

- “使用 Zod 替换自定义验证逻辑”

新描述：

- “使用 Zod 承担结构校验，并让 `WordValidator` 逐步收敛为业务规则校验器”

### 文件变更

- 新建 / 修改 `web/schemas/word.ts`
- 修改 `web/services/word/WordValidator.ts`

### 完成标准

- `WordValidator` 接口不破坏现有调用方
- 结构校验由 Zod 接管
- 复杂业务规则暂时仍可保留
- API 行为与原有逻辑大体一致

***

## Phase 6：类型统一与消费方收敛

### 目标

逐步让后端与前端消费方从 schema 推导类型，减少手写接口分散。

### 任务清单

- 从 `web/schemas/word.ts` 中导出必要类型
- 更新 `WordService.ts` 中的类型引用
- 更新 `WordAssembler.ts` 中的类型引用
- 视情况评估前端类型同步方式

### 注意事项

不要一次性把所有旧类型全部替掉。\
优先替换：

- 新增 schema 已明确覆盖的边界对象
- 重复定义最多的类型
- 容易发生漂移的 DTO 类型

### 文件变更

- `web/schemas/word.ts`
- `web/services/word/WordService.ts`
- `web/services/word/WordAssembler.ts`
- 前端类型定义文件（如必要）

### 完成标准

- 至少核心 Word 输入类型开始统一从 schema 推导
- 旧内联接口逐步减少
- 不引入大规模类型断裂

***

## Phase 7：验证、测试与回归检查

### 目标

确保 Zod 集成后的行为与现有逻辑兼容，并且错误结构稳定。

### 必做项

#### 7.1 静态检查

```
cd web && npm run type-check
cd web && npm run lint

```

#### 7.2 自动化测试

至少补以下测试：

- `validateBody / validateQuery / validateParams` 中间件测试
- 非法 body/query/params 返回 `400 + VALIDATION_ERROR`
- Zod 验证失败是否正确进入全局错误处理中间件
- `WordValidator` 兼容行为测试
- `yield.lemma` 与 `wordLower` 不匹配测试
- 边界值测试（空字符串、缺失字段、空数组、嵌套对象缺项）

#### 7.3 接口验证

重点验证：

- POST /words/add
- POST /words
- PUT /words/:id
- sync 相关关键端点

### 建议新增的测试要求

- 不只手动测 API
- 至少一部分测试要自动化
- 错误消息和错误码都要断言
- 不接受“能跑通但错误格式不一致”

***

# 技术细节修正版

## 1. 基础 schema 建议

```
import { z } from 'zod';

export const NonEmptyString = z.string().trim().min(1, '不能为空');
export const NonEmptyStringArray = z.array(NonEmptyString).min(1, '不能为空数组');

```

这里比原版更稳的地方是加了 `trim()`，避免 `" "` 被当成合法值。

***

## 2. WordSchema 可以保留，但定位要改

你原来的 `WordSchema` 结构设计本身可以继续用。\
但请把它理解成：

**“Word YAML 输入结构 schema”**\
而不是\
**“完整取代所有 Word 领域验证的唯一真相源”**

***

## 3. `lemma` 校验方式建议

原来你写的是 Zod parse 后额外判断，这个思路保留即可。\
但建议把它写成单独步骤，不要塞进 schema 顶层的复杂 `refine`，否则错误路径不易控制，也不利于兼容旧错误格式。

例如：

```
const result = WordSchema.safeParse(data);

if (!result.success) {
  return convertZodError(result.error);
}

const lemma = result.data.yield.lemma.trim().toLowerCase();
if (lemma !== wordLower) {
  return {
    valid: false,
    errors: ['yield.lemma must match word'],
  };
}

```

***

## 4. 错误处理方式必须调整

你原计划里对 `WordValidator` 的处理是兼容的，这点很好。\
但对于 API 边界校验，不要直接：

```
res.status(400).json(...)

```

要改成抛现有错误体系里的 `BadRequest`，交给全局错误处理中间件。

这是你整个 Zod 方案最应该和当前项目对齐的地方。

***

# 风险与注意事项（修正版）

## 1. 不要过早承诺“完全替换 WordValidator”

应改为：

- 先用 Zod 接管结构校验
- 再评估哪些业务规则还能下沉

## 2. 不要让 Zod 生成第二套错误响应风格

所有 API 验证失败必须走现有错误处理中间件。

## 3. 不要只做 body 验证

必须同时考虑：

- params
- query
- body

## 4. 不要在 controller/service 到处散落 `.parse()`

统一在中间件层用 `safeParse`。\
业务代码里只在极少数明确场景用 schema。

## 5. 不要把完整后端领域模型直接共享给前端

只共享边界 schema。

## 6. 配置验证不能过严

要兼容开发环境和真实部署环境。

***

# 完成标准（修正版）

以下标准比原版更贴项目实际：

## 必须满足

- `zod` 成功安装并在后端可用
- 已建立统一 schema 目录和验证中间件
- 至少一批关键 API 已接入 Zod 校验
- 验证失败统一进入现有错误处理中间件
- `WordValidator` 已开始兼容迁移，但不要求彻底消失
- `npm run type-check` 通过
- `npm run lint` 通过

## 建议满足

- 配置解析已接入 Zod
- 一部分公共 schema 已统一抽取
- 关键 Word 输入类型已从 schema 推导
- 非法输入、边界情况和错误结构已有自动化测试

***

# 你这份原方案最值得直接替换的部分

如果你想最小改动原文，我建议至少把这几处改掉：

### 原来的 Phase 1 / 2 / 3

- 安装依赖
- 创建完整 WordSchema
- 重构 WordValidator

### 改成

- 安装依赖 + 建立中间件与 schema 目录
- API 边界验证优先接入
- 配置验证
- 公共 schema 抽取
- WordValidator 兼容迁移

***

如果你要，我可以下一步把这份优化后的内容**直接整理成可下载的 Markdown 文件**，文件名就叫 `zod-integration-plan-v2-optimized.md`。
