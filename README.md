# Ad Fontes Manager

Ad Fontes Manager 是 Ad Fontes 英语学习体系里的词条管理工具。它负责几件事：保存词条、编辑 YAML、预览卡片、同步本地和数据库的数据，以及把词条导出到 Anki。

这个项目是一个前后端分离的 Web 应用。前端用 Vue 3，后端用 Express 5，数据库是 SQLite (better-sqlite3 + Drizzle ORM)。
<img width="2560" height="1410" alt="image" src="https://github.com/user-attachments/assets/97ea07fc-f1be-455f-91a2-4360efde1634" />

## 这个项目现在能做什么

- 管理词条（搜索、排序、分页、多语言支持）
- 用 YAML 编辑词条内容，并做基本校验
- 保存时自动冲突检测，可选强制覆盖
- 预览单词卡片的 HTML 效果
- 导出单个词条到 AnkiConnect 或 `.apkg`
- 跨页保留选择结果
- 批量检测重复词条，再导入到 Anki
- 关闭批量弹窗后继续在后台执行检查或导入
- 在当前搜索结果上执行 `Select All Matching`

## 适合什么场景

- 你需要反复调整 YAML，并随时看预览结果
- 你会把词条做成 Anki 卡片，而且希望单条导出和批量导出保持同一套样式
- 你一次要处理很多词条，不想因为翻页或临时离开界面丢掉选择和任务状态

## 环境要求

- Node.js 22 LTS 或更高版本
- npm 10 或更高版本
- 无需额外安装数据库（SQLite 内嵌于应用）

SQLite 数据库文件会自动创建在 `web/data/` 目录下。

## 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd ad-fontes-manager

# 安装后端依赖
cd web
npm install

# 安装前端依赖
cd client
npm install
cd ..

# 配置环境变量
cp .env.example .env

# 如需初始化数据库
cd ../node
npm install
npm run init-db
cd ../web

# 启动开发环境
npm run dev
```

启动后默认地址：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:8080/api`

## Docker 构建与运行

推荐优先使用仓库自带脚本 [scripts/start-docker-prod.ps1](/d:/myCode/formal-projects/ad-fontes-manager/scripts/start-docker-prod.ps1)，它会校验生产环境变量、停止旧容器、按当前项目代码重新构建 `app` 服务，然后再启动容器。

先检查 `.env.production`，至少确认下面几项已经按你的环境填写：

- `ADMIN_TOKEN`
- `VITE_ADMIN_TOKEN`（应与 `ADMIN_TOKEN` 保持一致）
- `DATABASE_URL`
- `SERVER_HOST=0.0.0.0`

然后在仓库根目录执行脚本：

```powershell
./scripts/start-docker-prod.ps1
```

常用参数：

```powershell
# 完整重建，不复用旧缓存
./scripts/start-docker-prod.ps1 -NoCache

# 保留当前容器，不先执行 docker compose down
./scripts/start-docker-prod.ps1 -SkipDown

# 如需同时拉取较新的基础镜像，再显式开启
./scripts/start-docker-prod.ps1 -PullBaseImages

# 指定环境文件
./scripts/start-docker-prod.ps1 -EnvFile .env.production
```

如果你想直接执行底层 Docker 命令，对应关系如下：

```bash
# 按当前项目代码重新构建 app 镜像
docker compose --env-file .env.production build app

# 启动 app 容器
docker compose --env-file .env.production up -d --force-recreate app
```

如果你需要完整重建但不复用缓存：

```bash
docker compose --env-file .env.production build --no-cache app
```

如果你确实还想连基础镜像也一起更新，再额外加上 `--pull`：

```bash
docker compose --env-file .env.production build --pull app
```

如果你的环境仍然使用旧版命令，也可以把 `docker compose` 替换成 `docker-compose`。

执行完成后，可用下面的命令查看镜像和容器状态：

```bash
docker compose --env-file .env.production images
docker compose --env-file .env.production ps
```

## 常用命令

```bash
# 同时启动前后端
cd web && npm run dev

# 只启动后端
cd web && npm run dev:server

# 只启动前端
cd web/client && npm run dev

# 构建前端
cd web && npm run build

# 后端类型检查
cd web && npm run type-check

# 前端类型检查
cd web/client && npm run type-check

# 前端测试
cd web/client && npm run test
```

## 目录结构

```text
ad-fontes-manager/
|-- web/
|   |-- client/              # Vue 前端
|   |-- controllers/         # 控制器
|   |-- routes/              # 路由
|   |-- services/            # 业务逻辑
|   |-- middleware/          # 中间件
|   |-- db/                  # 数据库访问 (Drizzle ORM)
|   |-- data/                # SQLite 数据文件目录
|   |-- utils/               # 工具函数
|   `-- server.ts            # 后端入口
|-- node/                    # 维护脚本 (CLI 工具)
|-- drizzle/                 # Drizzle 迁移文件
|-- docs/                    # 项目文档
|-- README.md
`-- CHANGELOG.md
```

## Anki 导出说明

项目里现在有两条导出路径。

单个词条导出：
- 选择 deck、model、是否加反向卡、tags
- 生成当前词条的 HTML 字段
- 导入到 AnkiConnect，或导出为 `.apkg`

批量导出：
- 复用单条导出的 HTML 和字段逻辑
- 先列出所有待导出的词条
- 可以先做重复检测
- 对重复项统一选择跳过或覆盖
- 导入时显示进度
- 任务开始后，就算关掉弹窗或切换当前 SPA 页面，也会继续执行

目前 `tags` 的默认值是空。

## 批量选择说明

词条列表的选择逻辑最近做过一轮调整，现在的行为是：

- 翻页时保留已选项
- 搜索、排序、刷新、修改每页数量后会清空选择
- 表头复选框只作用于当前页
- 工具栏显示总选中数
- 可以手动清空全部选择
- 可以对当前搜索结果执行 `Select All Matching`

如果当前搜索结果的总数超过 `150`，界面会先弹出确认提示，确认后才会真正加入选择集。

## 配置

项目按环境变量读取配置。

必填项：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | SQLite 数据库文件路径 |
| `ADMIN_TOKEN` | 管理接口令牌 |
| `NODE_ENV` | `development`、`production` 或 `test` |

可选的 Anki 配置：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `ANKI_CONNECT_HOST` | AnkiConnect 主机地址 | `127.0.0.1` |
| `ANKI_CONNECT_PORT` | AnkiConnect 端口 | `8765` |

## 文档

- [docs/API.md](./docs/API.md)
- [docs/DATABASE.md](./docs/DATABASE.md)
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- [docs/SECURITY.md](./docs/SECURITY.md)

## 版本记录

更新历史见 [CHANGELOG.md](./CHANGELOG.md)。

当前已发布版本是 `1.5.0`。`1.6.0` 还在整理中。

## 许可证

[MIT](./LICENSE)
