# Phase 0 写接口审计清单

日期：2026-03-06

## 审计范围

- `web/routes/words.ts`
- `web/routes/sync.ts`
- `web/routes/core.ts`

## 写接口清单与鉴权状态

| Route | Method | 行为 | 鉴权 |
|---|---|---|---|
| `/api/words` | `POST` | 保存单词（创建/更新） | `requireWriteAccess` |
| `/api/words/add` | `POST` | 新增单词 | `requireWriteAccess` |
| `/api/words/:id` | `DELETE` | 删除单词 | `requireWriteAccess` |
| `/api/local` | `POST` | 本地草稿写入 | `requireWriteAccess` |
| `/api/local/:id` | `DELETE` | 本地草稿删除 | `requireWriteAccess` |
| `/api/sync/execute` | `POST` | 同步落库执行 | `requireWriteAccess` |
| `/api/sync` | `POST` | 已废弃同步入口（保留返回 410） | `requireWriteAccess` |
| `/api/config` | `POST` | 写入系统配置 | `requireWriteAccess` |

## 读接口（本阶段不强制用户认证）

- `/api/words` `GET`
- `/api/words/details` `GET`
- `/api/words/:id` `GET`
- `/api/local` `GET`
- `/api/sync/check` `POST`（冲突检查，不写库）
- `/api/status` `GET`
- `/api/config` `GET`
- `/api/check` `GET`
- `/api/health` `GET`

## 鉴权语义

- 缺少 `X-Admin-Token`：`401 Unauthorized`
- `X-Admin-Token` 错误：`403 Forbidden`
- 服务端未配置 admin token：`503 Service Unavailable`

