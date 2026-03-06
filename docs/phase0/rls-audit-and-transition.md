# Phase 0 RLS 审计与过渡说明

日期：2026-03-06

## 审计结论

历史 schema 在以下业务表均存在 `Allow public write access`（`FOR ALL USING true WITH CHECK true`）：

- `words`
- `etymologies`
- `cognates`
- `examples`
- `synonyms`
- `user_requests`

该策略等价于对公共身份开放写权限，存在高风险匿名写入面。

## 本次策略调整

1. 移除上述 6 张表的 `Allow public write access`。
2. 新增 `Allow service write access`，限定 `TO postgres`：
   - `FOR ALL`
   - `USING true`
   - `WITH CHECK true`
3. 保留 `Allow public read access`（只读能力不受本阶段影响）。

## 迁移与回滚脚本

- Up: `migrations/20260306_phase0_rls_lockdown.up.sql`
- Down: `migrations/20260306_phase0_rls_lockdown.down.sql`

## 开发/测试过渡方案

- 应用写入通过受控服务连接（当前默认 `postgres` 角色）进行。
- 不再依赖 `public write` 作为开发便捷通道。
- 若本地使用非 `postgres` 角色，需要显式授予等效受控角色策略，而不是恢复 `public write`。

