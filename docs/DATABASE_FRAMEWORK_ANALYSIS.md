# 数据库框架引入分析报告

> **项目**: Ad Fontes Manager  
> **技术栈**: TypeScript + Express + PostgreSQL  
> **分析日期**: 2026-03-09  
> **状态**: 评估阶段

---

## 1. 项目现状分析

### 1.1 当前数据库访问模式

项目目前采用**原生 PostgreSQL 驱动** (`pg` 模块) 进行数据库操作：

- **连接管理**: 使用 `pg.Pool` 进行连接池管理 ([db/index.ts](../web/db/index.ts))
- **查询方式**: 原始 SQL 字符串拼接
- **数据映射**: 手动将数据库结果映射为对象
- **事务处理**: 手动管理客户端连接和释放

### 1.2 现有代码特点

```typescript
// 当前模式示例（来自 WordRepository.ts）
const result = await client.query(
  `SELECT * FROM words WHERE lower(lemma) = $1`,
  [lemma.toLowerCase()]
);
return result.rows[0] || null;
```

**优势**:
- 零抽象开销，性能最优
- 完全控制 SQL 执行
- 无额外学习成本

**痛点**:
- SQL 字符串拼接容易出错
- 缺乏类型安全（查询结果类型为 `unknown`）
- 手动管理关系查询（如单词-标签多对多关系）
- 迁移管理完全手动

### 1.3 新增标签功能的复杂性

即将实现的标签系统涉及：
- 多对多关系（words ↔ tags）
- 关联表查询和批量操作
- 按标签筛选、统计等复杂查询

这些场景下，原生 SQL 的维护成本将显著增加。

---

## 2. 候选框架评估

### 2.1 ORM 类框架

#### 2.1.1 Prisma

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐⭐⭐⭐ 自动生成 TypeScript 类型 |
| **开发体验** | ⭐⭐⭐⭐⭐ 优秀的 VS Code 插件和自动补全 |
| **迁移管理** | ⭐⭐⭐⭐⭐ 内置迁移系统 |
| **查询能力** | ⭐⭐⭐⭐ 关系查询方便，复杂查询需用 `queryRaw` |
| **性能** | ⭐⭐⭐ 有运行时开销，但可优化 |
| **学习曲线** | ⭐⭐⭐ 需要学习 Schema DSL |

**适配性分析**:
- ✅ 与现有 PostgreSQL 完美兼容
- ✅ 支持多对多关系的声明式定义
- ✅ 迁移系统可管理现有 schema
- ⚠️ 需要重写所有 Repository 层代码
- ⚠️ 引入约 15-20MB 的依赖体积

**适用场景**: 新项目或大规模重构时首选

---

#### 2.1.2 TypeORM

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐⭐⭐ 装饰器驱动类型定义 |
| **开发体验** | ⭐⭐⭐ 功能丰富但配置复杂 |
| **迁移管理** | ⭐⭐⭐⭐ 支持自动和手动迁移 |
| **查询能力** | ⭐⭐⭐⭐ 强大的 QueryBuilder |
| **性能** | ⭐⭐⭐ 运行时反射有开销 |
| **学习曲线** | ⭐⭐ 概念多，容易踩坑 |

**适配性分析**:
- ✅ 与 Express 生态集成良好
- ✅ 支持 Active Record 和 Data Mapper 两种模式
- ⚠️ 社区活跃度下降，Issue 响应慢
- ⚠️ 装饰器语法与现有代码风格差异大
- ⚠️ 复杂查询时性能调优困难

**适用场景**: 需要复杂查询构建能力的项目

---

#### 2.1.3 Sequelize

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐ 类型支持是后期添加，不够完善 |
| **开发体验** | ⭐⭐⭐ 传统 ORM，API 较老 |
| **迁移管理** | ⭐⭐⭐ 需要额外配置 CLI |
| **查询能力** | ⭐⭐⭐⭐ 功能全面 |
| **性能** | ⭐⭐⭐ 中等 |
| **学习曲线** | ⭐⭐⭐ 概念较多 |

**适配性分析**:
- ✅ 最成熟的 Node.js ORM
- ⚠️ TypeScript 支持是"后加"的，体验不佳
- ⚠️ 与现有代码风格差异大
- ❌ 不推荐新项目采用

**适用场景**: 维护旧项目，新项目不推荐

---

### 2.2 Query Builder 类框架

#### 2.2.1 Knex.js

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐⭐⭐ 良好的类型定义 |
| **开发体验** | ⭐⭐⭐⭐ 链式 API，直观易用 |
| **迁移管理** | ⭐⭐⭐⭐ 内置迁移系统 |
| **查询能力** | ⭐⭐⭐⭐⭐ 灵活强大的查询构建 |
| **性能** | ⭐⭐⭐⭐ 轻量级，开销小 |
| **学习曲线** | ⭐⭐⭐⭐ 易于上手 |

**适配性分析**:
- ✅ 渐进式采用，可部分替换现有代码
- ✅ 保留 SQL 的灵活性，同时提供类型安全
- ✅ 与现有 `pg` 驱动兼容
- ✅ 迁移系统可逐步引入
- ⚠️ 需要学习链式查询 API

**适用场景**: 需要保留 SQL 灵活性，同时提升开发体验

---

#### 2.2.2 Kysely

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐⭐⭐⭐ 编译时 SQL 类型检查 |
| **开发体验** | ⭐⭐⭐⭐ 现代 TypeScript 优先设计 |
| **迁移管理** | ⭐⭐ 需配合其他工具 |
| **查询能力** | ⭐⭐⭐⭐ 类型安全的查询构建 |
| **性能** | ⭐⭐⭐⭐⭐ 零运行时开销 |
| **学习曲线** | ⭐⭐⭐ 需要理解类型生成 |

**适配性分析**:
- ✅ 极致的类型安全，编译时捕获 SQL 错误
- ✅ 零运行时开销，性能最优
- ✅ 现代 TypeScript 设计，与项目风格契合
- ⚠️ 相对较新，生态不如 Knex 成熟
- ⚠️ 需要生成类型定义文件

**适用场景**: 对类型安全要求极高的项目

---

### 2.3 轻量级辅助库

#### 2.3.1 Slonik

| 维度 | 评估 |
|------|------|
| **类型安全** | ⭐⭐⭐⭐ 基于模板的类型安全 |
| **开发体验** | ⭐⭐⭐ 函数式 API |
| **迁移管理** | ⭐ 无内置支持 |
| **查询能力** | ⭐⭐⭐ 基础查询封装 |
| **性能** | ⭐⭐⭐⭐ 轻量 |
| **学习曲线** | ⭐⭐⭐ 需要适应函数式风格 |

**适配性分析**:
- ✅ 轻量级，不引入复杂抽象
- ✅ 内置 SQL 注入防护
- ⚠️ 生态小，社区支持有限
- ⚠️ 功能相对简单

**适用场景**: 只需要基础封装的项目

---

## 3. 框架对比矩阵

| 框架 | 类型安全 | 迁移管理 | 学习成本 | 重构成本 | 性能 | 推荐度 |
|------|----------|----------|----------|----------|------|--------|
| **Prisma** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | 高 | 中 | ⭐⭐⭐⭐ |
| **TypeORM** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 高 | 高 | 中 | ⭐⭐⭐ |
| **Sequelize** | ⭐⭐ | ⭐⭐⭐ | 中 | 高 | 中 | ⭐⭐ |
| **Knex.js** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 低 | 中 | 高 | ⭐⭐⭐⭐⭐ |
| **Kysely** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 中 | 中 | 高 | ⭐⭐⭐⭐ |
| **Slonik** | ⭐⭐⭐⭐ | ⭐ | 低 | 低 | 高 | ⭐⭐⭐ |

---

## 4. 针对标签功能的专项分析

### 4.1 标签系统的技术需求

```typescript
// 需要支持的操作示例
interface TagSystemRequirements {
  // 基础 CRUD
  createTag(tag: TagInput): Promise<Tag>;
  assignTagToWord(wordId: string, tagId: string): Promise<void>;
  
  // 复杂查询
  getWordsByTags(tagIds: string[]): Promise<Word[]>;
  getTagsByWord(wordId: string): Promise<Tag[]>;
  getWordsWithTagStats(): Promise<WordWithTags[]>;
  
  // 批量操作
  bulkAssignTags(wordIds: string[], tagId: string): Promise<void>;
  
  // 筛选和统计
  searchWordsByTagsAndFilters(
    tags: string[], 
    filters: WordFilters
  ): Promise<PaginatedWords>;
}
```

### 4.2 各框架实现复杂度对比

#### Prisma 实现
```prisma
// Schema 定义简洁
model Word {
  id   String @id @default(uuid())
  tags WordTag[]
}

model Tag {
  id   String @id @default(uuid())
  words WordTag[]
}

model WordTag {
  wordId String
  tagId  String
  word   Word @relation(fields: [wordId], references: [id])
  tag    Tag  @relation(fields: [tagId], references: [id])
  @@id([wordId, tagId])
}
```

**复杂度**: 低 - 关系查询自动生成

---

#### Knex.js 实现
```typescript
// 需要手动编写关联查询
async getWordsByTags(tagIds: string[]) {
  return knex('words')
    .join('word_tag_mappings', 'words.id', 'word_tag_mappings.word_id')
    .whereIn('word_tag_mappings.tag_id', tagIds)
    .groupBy('words.id')
    .havingRaw('COUNT(DISTINCT word_tag_mappings.tag_id) = ?', [tagIds.length]);
}
```

**复杂度**: 中 - 需要手动编写 SQL，但有类型提示

---

#### 原生 SQL 实现
```typescript
// 当前模式 - 字符串拼接
async getWordsByTags(tagIds: string[]) {
  const placeholders = tagIds.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT w.* FROM words w
    JOIN word_tag_mappings wtm ON w.id = wtm.word_id
    WHERE wtm.tag_id IN (${placeholders})
    GROUP BY w.id
    HAVING COUNT(DISTINCT wtm.tag_id) = $${tagIds.length + 1}
  `;
  const result = await pool.query(query, [...tagIds, tagIds.length]);
  return result.rows;
}
```

**复杂度**: 高 - 容易出错，类型不安全

---

## 5. 推荐方案

### 5.1 首选方案: Knex.js

**推荐理由**:

1. **渐进式迁移**: 无需一次性重写所有代码，可逐个 Repository 替换
2. **学习成本低**: 链式 API 直观，团队上手快
3. **保留灵活性**: 复杂查询仍可写原始 SQL
4. **迁移管理**: 内置迁移系统可管理标签表创建
5. **性能优秀**: 轻量级，运行时开销小

**实施策略**:
```
Phase 1: 引入 Knex.js，仅用于新标签功能
Phase 2: 逐步替换现有 Repository（按需）
Phase 3: 统一使用 Knex.js 进行所有数据库操作
```

---

### 5.2 备选方案: Prisma

**适用情况**:
- 计划进行大规模代码重构
- 团队愿意投入时间学习新工具
- 需要最强的类型安全保障

**注意事项**:
- 需要重写所有数据库访问层
- 需要调整开发工作流（生成客户端）
- 初期投入成本高，长期收益大

---

### 5.3 保守方案: 保持现状 + 辅助库

**适用情况**:
- 标签功能是短期需求
- 不想引入额外依赖
- 团队对 SQL 非常熟悉

**改进建议**:
- 引入 `sql-template-tag` 进行 SQL 模板化
- 添加查询构建工具函数
- 手动编写类型定义

---

## 6. 风险与建议

### 6.1 引入 ORM 的风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 性能回归 | 高 | 建立基准测试，监控慢查询 |
| 学习成本 | 中 | 安排培训，编写示例代码 |
| 迁移失败 | 中 | 保留回滚方案，逐步迁移 |
| 过度抽象 | 中 | 允许使用原始 SQL 处理复杂查询 |

### 6.2 保持现状的风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SQL 注入 | 高 | 严格代码审查，使用参数化查询 |
| 维护成本 | 中 | 建立 SQL 编写规范 |
| 类型安全 | 中 | 手动维护类型定义 |

---

## 7. 结论

针对 **Ad Fontes Manager** 项目的实际情况：

- **项目规模**: 中等（约 10 张表）
- **团队规模**: 小团队
- **当前状态**: 原生 SQL 运行良好
- **新需求**: 标签系统引入多对多关系

**最终建议**:

> **采用 Knex.js 作为数据库访问层**

**具体原因**:
1. 渐进式采用，风险可控
2. 完美适配标签功能的多对多查询需求
3. 学习成本低，与现有代码风格兼容
4. 保留 SQL 灵活性，不引入过度抽象
5. 迁移管理工具完善，便于后续 schema 变更

**下一步行动**:
1. 在标签功能开发中引入 Knex.js
2. 评估团队使用反馈
3. 根据反馈决定是否全面迁移

---

## 附录

### A. 参考资料

- [Prisma Documentation](https://www.prisma.io/docs)
- [Knex.js Documentation](https://knexjs.org/)
- [Kysely Documentation](https://kysely.dev/)
- [Node.js ORM Comparison](https://github.com/typeorm/typeorm)

### B. 相关文档

- [DATABASE.md](./DATABASE.md) - 当前数据库设计
- [schema.sql](../schema.sql) - 数据库 Schema
- [API.md](./API.md) - API 设计规范
