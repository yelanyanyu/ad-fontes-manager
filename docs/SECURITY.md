# 安全指南

## 敏感数据管理

### 环境变量配置

项目已切换为通过环境变量加载配置。开发环境可使用根目录 `.env`，生产环境必须使用系统环境变量或 Docker `env_file`。请勿再使用 `web/config.json` / `web/config.json.template`。

以下配置包含敏感信息，必须妥善保护：

- 数据库凭证 (DATABASE_URL)
- 管理员令牌 (ADMIN_TOKEN)
- API 密钥

#### 设置步骤

1. 在项目根目录创建 `.env` 文件（可基于 `.env.example`）：
   ```bash
   cp .env.example .env
   ```

2. 使用真实值编辑 `.env`：
   ```bash
   NODE_ENV=development
   DATABASE_URL=postgresql://your_user:your_password@localhost:5432/your_db
   ADMIN_TOKEN=your-secure-random-token
   PORT=8080
   CLIENT_DEV_PORT=5173
   ```

3. 确保 `.env` 未被提交（已在 `.gitignore` 中配置）

### Git 历史清理（已完成）

**状态**：文件 `web/config.json` 已使用 `git-filter-repo` 成功从 Git 历史中移除。

#### 执行的操作：
- 安装了 `git-filter-repo` 工具
- 从整个 Git 历史中移除了 `web/config.json`
- 重新打包并清理了仓库

#### 清理后需要执行的操作：

1. **重新添加远程仓库**：
   ```bash
   git remote add origin git@github.com:yelanyanyu/ad-fontes-manager.git
   ```

2. **强制推送到远程**（需要与团队协调）：
   ```bash
   git push origin --force --all
   ```

3. **轮换所有可能已暴露的凭证**：
   - 数据库密码
   - API 密钥
   - 管理员令牌

4. **通知团队成员**：
   - 所有人必须重新克隆仓库
   - 任何打开的 PR 可能需要重新创建

## 安全最佳实践

### 环境变量

生产环境应使用环境变量而非配置文件：

```bash
# 必需
export NODE_ENV=production
export DATABASE_URL=postgresql://user:pass@host:5432/db
export ADMIN_TOKEN=$(openssl rand -hex 32)

# 可选
export PORT=8080
export CLIENT_DEV_PORT=5173
```

### 管理员认证

配置更新端点 (`/api/config`) 需要管理员令牌：

**生产环境**：
- 必须设置 `ADMIN_TOKEN` 环境变量
- 请求头必须包含 `X-Admin-Token`
- 未授权访问返回 401
- 未配置服务返回 503

**开发环境**：
- 可选验证
- 如果设置了 `ADMIN_TOKEN` 则进行验证

### Helmet 安全头

项目已配置 Helmet 中间件提供以下安全头：

| 头信息 | 值 | 说明 |
|--------|-----|------|
| Content-Security-Policy | 见配置 | 防止 XSS |
| X-Frame-Options | DENY | 防止点击劫持 |
| X-Content-Type-Options | nosniff | 防止 MIME 嗅探 |
| Strict-Transport-Security | max-age=15552000 | 强制 HTTPS |

### 数据库安全

- 使用 UUID 作为主键
- 启用行级安全 (RLS)
- 连接池限制最大连接数
- 使用参数化查询防止 SQL 注入

## 预防措施

### Pre-commit Hooks

安装 hooks 防止提交敏感文件：

```bash
# 使用 husky
npx husky add .husky/pre-commit "git diff --cached --name-only | grep -E '\\.env(\\.|$)' && exit 1 || exit 0"
```

### GitHub Secret Scanning

在仓库设置中启用：
1. Settings → Security → Secret scanning
2. 启用 "Secret scanning" 和 "Push protection"

### 定期审计

```bash
# 检查可能包含数据的大文件
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(restpath)' | awk '/^blob/ {print $3" "$4}' | sort -rn | head -20
```

## 安全清单

- [x] `.env` 在 `.gitignore` 中
- [x] `web/config.json` 已从 Git 历史中移除
- [x] `web/config.json.template` 已移除（不再使用）
- [ ] 数据库密码已更改为强密码
- [ ] ADMIN_TOKEN 是加密安全的随机字符串
- [ ] 生产环境使用系统环境变量（不使用 `.env` 文件）
- [ ] 团队成员了解安全策略
- [ ] 启用了 GitHub Secret Scanning

## 报告安全问题

如果发现安全漏洞，请：

1. **不要**创建公开 issue
2. 直接联系维护者
3. 在公开披露前给予修复时间

## 额外资源

- [GitHub Docs: 移除敏感数据](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Git filter-repo 文档](https://github.com/newren/git-filter-repo)
- [OWASP 密钥管理](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
