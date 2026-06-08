# Ad Fontes Manager — 零基础完全指南

这份教程写给没有任何编程经验的用户。跟着做完每一步，你就能独立使用本工具生成英语/德语词条，并导出到 Anki 复习。

---

## 1. 这是什么？

Ad Fontes Manager 是一个**词源词汇学习工具**。你输入一个英语或德语单词，它会：

1. 查词源（前缀、词根、历史来源）
2. 用 AI 生成一段第一人称的艺术性叙事——让你"身体感受到"这个词的原始动作
3. 生成意义演化路径、同源词族、近义词辨析
4. 审核评分，不达标可以自动修复
5. 导出到 Anki，按间隔重复规律复习

它不是词典，不是翻译器，而是一个**让你用身体和画面记住单词**的工具。

---

## 2. 安装

### Windows

1. 打开 [Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases) 页面
2. 下载最新版本的 `Ad-Fontes-Manager-Setup-x.x.x.exe`
3. 双击运行，按提示安装
4. 桌面上会出现 Ad Fontes Manager 图标，双击启动

安装后应用会自动检查更新，发现新版本时会在后台下载并提醒你安装。

### macOS

1. 打开 [Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases) 页面
2. 下载最新版本的 `.dmg` 文件
3. 双击挂载，将 Ad Fontes Manager 拖入 Applications 文件夹
4. 首次打开时，如果提示"无法验证开发者"，去 系统设置 → 隐私与安全性 → 点击"仍要打开"

<!-- TODO: 截图 — 安装完成后的桌面图标和启动界面 -->

---

## 3. 配置 AI

Ad Fontes Manager 需要连接 AI 大模型才能生成词条。你需要一个 AI 提供商的 API Key。

### 3.1 获取 API Key

推荐使用**硅基流动**（SiliconFlow），注册即送免费额度：

1. 打开 [https://siliconflow.cn](https://siliconflow.cn)，注册账号
2. 进入控制台 → API 密钥 → 新建密钥 → 复制

其他可选厂商：DeepSeek、OpenRouter、DashScope（阿里云百炼）、AIHubMix。每个厂商的获取方式类似。

### 3.2 填入 API Key

1. 点击左侧边栏的**齿轮图标**（Settings）
2. 点击左侧 **API** 标签
3. 在「AI 提供商」列表中，选择你要用的厂商（如 **Silicon**）
4. 在右侧面板中粘贴你的 API Key
5. 点击 **Test** 按钮——如果显示绿色成功提示（含延迟毫秒数），说明连接正常

<!-- TODO: 截图 — Settings → API → Providers → Silicon → 填入 Key → Test 成功 -->

### 3.3 确认模型配置

1. 切换到 **阶段模型分配**（Stages）标签
2. 确认三个阶段的模型已分配：
   - **fast** → 负责查词源（推荐快速便宜的模型，reasoning 关掉）
   - **balanced** → 负责生成中文创意内容（推荐中等模型）
   - **expert** → 负责审核评分（推荐最强模型，reasoning 开 medium 或 high）
3. Reasoning Effort（推理强度）：expert 阶段建议选 `medium` 或 `high`

常用模型组合示例（使用 DeepSeek 厂商）：

| 阶段     | 模型                  | Reasoning |
| -------- | --------------------- | --------- |
| fast     | deepseek-v4-flash[1m] | none      |
| balanced | deepseek-v4-pro[1m]   | low       |
| expert   | deepseek-v4-pro[1m]   | medium    |

<!-- TODO: 截图 — Stages 配置页面 -->

> **使用其他厂商？** 在 Providers 列表中配置即可。支持 OpenAI 格式（硅基流动、OpenRouter、DashScope、AIHubMix）和 Anthropic 格式（DeepSeek Anthropic 端点）。每个模型可单独选择端点类型。

---

## 4. 生成第一个词条

### 4.1 打开 AI 生成面板

1. 在编辑器上方工具栏中，点击 **AI Generate** 按钮
2. 右侧会弹出 AI 生成面板

<!-- TODO: 截图 — 编辑器顶部的 AI Generate 按钮位置 -->

### 4.2 输入单词

1. 在 **Word** 输入框中输入目标单词，例如 `perseverance`
2. **Context**（可选）：输入一个包含该单词的句子作为上下文
3. **Language**：选择 `en`（英语）或 `de`（德语）
4. 点击 **Generate** 按钮

<!-- TODO: 截图 — AI Generate 面板输入状态 -->

### 4.3 观察生成进度

生成分为三个阶段：

| 阶段         | 名称       | 做什么               | 通常耗时 |
| ------------ | ---------- | -------------------- | -------- |
| 🔍 Searching | 结构化研究 | 搜词源、拆词根词缀   | 15-60 秒 |
| 💭 Pondering | 创意富化   | 写中文叙事、意义演化 | 30-90 秒 |
| ✅ Auditing  | 质量审核   | 评分 + 修改建议      | 15-60 秒 |

每个阶段完成后，你可以点击阶段名称展开详情：

- **Tools**：查看搜索工具调用了哪些词源网站
- **Thinking**：查看 AI 的推理过程（如果开启了思考模式）
- **Raw**：查看 AI 输出的原始文本

<!-- TODO: 截图 — 阶段列表示例（searching 完成、pondering 进行中） -->

### 4.4 查看结果

生成完成后：

1. **审核评分**（overall_score）：满分 10 分，6 分及以上为合格。你可以在评分旁边手动修改分数（User Review Score），修改后工作集会按你的评分排序
2. **各字段评分**（field_scores）：visual_imagery_zh、meaning_evolution_zh、image_differentiation_zh 各自得分
3. **修改建议**（revision_notes）：AI 给出的具体修改方向

<!-- TODO: 截图 — 完成后的审核评分界面 -->

### 4.5 填入编辑器

审核通过后，点击 **Fill Editor** 按钮，生成的 YAML 会自动经过格式修复（Format Fix）后填入左侧编辑器。

---

## 5. 看懂审核结果

### 评分标准

- **8-10 分**：质量优秀，叙事生动，场景不僵硬
- **6-7 分**：合格，可以使用，可能有小瑕疵
- **5 分及以下**：不合格（fail），需要修复

### 三个被审核的字段

| 字段                       | 中文含义 | 审核重点                                                             |
| -------------------------- | -------- | -------------------------------------------------------------------- |
| `visual_imagery_zh`        | 视觉意象 | 第一人称场景是否生动？有没有 AI 味（公式化转折、填充词、模板句式）？ |
| `meaning_evolution_zh`     | 意义演化 | 从身体动作到抽象用法的引申路径是否清晰？转折句式是否满足呼应规则？   |
| `image_differentiation_zh` | 意象区分 | 近义词之间的根词画面差异是否具体？有没有写成工整对仗的说明文？       |

### revision_notes 怎么读

AI 会写类似：

> 对 visual_imagery_zh 的修改意见：物像道具一样被摆出来满足 checklist，没有融入一个连贯的生存瞬间。从物开始，别写"我看见"。

这是给下一步修复用的指令，你可以直接使用，也可以补充自己的意见。

---

## 6. 用 Improve Text 修复不合格的词条

### 6.1 什么时候需要修复

- 审核评分低于 6 分
- 或者你觉得某个字段写得不够好

### 6.2 如何修复

1. 查看 **Revision notes** 文本框——AI 已经填入了修改建议
2. （可选）在文本框中追加你自己的修改意见，例如"visual_imagery_zh 太短了，扩展到三段"
3. 点击 **Improve Text** 按钮
4. 系统会启动修复流水线：fixing（按建议改写）→ auditing（重新审核）
5. 等待新的审核结果——通常评分会有所提升

<!-- TODO: 截图 — Improve Text 按钮和 Revision notes 文本框 -->

> **提示**：如果首次评分已经是 10 分，但你还是想修改，可以在 Revision notes 中写入你的意见，再点击 Improve Text。系统会提示"已达满分"，但你可以用自己的意见覆盖。

### 6.3 反复修复

如果第一次修复后仍然不理想，可以继续修改 Revision notes，再次点击 Improve Text。每次修复都会创建新的审核结果。

---

## 7. 编辑器功能

### 7.1 实时校验

编辑器在你输入或粘贴 YAML 时会自动进行实时校验（300ms 防抖）。编辑器标题栏会显示当前状态：

- **Checking YAML**：正在校验中
- **YAML 有效**（绿色）：语法和 Schema 都通过
- **YAML 错误**（红色）：存在问题需要修复

错误列表中会显示具体的字段路径和问题描述。实时校验使用严格模式——不会自动修改你的 YAML 内容。

### 7.2 格式修复（Format Fix）

如果 YAML 有格式问题（如 markdown fence 残留、区块位置错误等），点击工具栏的 **Repair** 按钮执行格式修复：

- **Basic Format Fix**：确定性的语法修复，如清理 markdown 标记、修复引号错误、提升被错误嵌套的顶层区块
- **Enhanced Format Fix**：使用 LLM 进行更复杂的修复（需要手动触发）

修复后编辑器内容会自动更新，修复信息会在底部显示。

### 7.3 重复键检测

如果你手动编辑 YAML 时不小心写了重复的映射键，编辑器会立即检测并提示具体的重复键名和行号。

---

## 8. 保存到数据库

1. 在编辑器中确认 YAML 内容无误（校验状态为绿色）
2. 点击编辑器上方的 **Save** 按钮（或按 `Ctrl+S`）
3. 保存前会自动执行格式修复
4. 如果词条已存在（同一个单词 + 同一种语言），系统会弹出**冲突检测**窗口，展示新旧版本差异
5. 选择「覆盖」或「取消」

<!-- TODO: 截图 — 保存按钮位置 + 冲突检测窗口 -->

保存成功后，词条会出现在右侧的单词列表中。

---

## 9. 导出到 Anki

### 9.1 准备工作

1. 安装 [Anki](https://apps.ankiweb.net/)
2. 在 Anki 中安装 [AnkiConnect](https://ankiweb.net/shared/info/2055492159) 插件
3. 保持 Anki 在后台运行

### 9.2 单条导出

1. 在编辑器中打开要导出的词条
2. 点击工具栏中的 **Export to Anki** 按钮
3. 选择「AnkiConnect」或「Download .apkg」
4. 如果选择 AnkiConnect：词条会实时同步到 Anki
5. 如果选择 .apkg：下载文件后，在 Anki 中 文件 → 导入

<!-- TODO: 截图 — Export 按钮和导出选项 -->

### 9.3 批量导出

1. 在右侧单词列表中勾选要导出的词条
2. 点击工具栏中的 **Batch Export** 按钮
3. 选择导出方式、目标牌组、笔记类型
4. 系统会自动检测重复并开始导出
5. 导出在后台执行——你可以关闭弹窗，回头在队列面板查看进度

<!-- TODO: 截图 — 批量勾选 + Batch Export 按钮 -->

### 9.4 词条 JSON 备份与迁移

如果你只想无损导出词条数据，而不是导出 Anki 卡片：

1. 在右侧单词列表中勾选要导出的词条
2. 点击词表工具栏里的导出图标按钮
3. 系统会下载约定格式的 JSON 文件，包含词条内容和必要元数据
4. 在另一台设备或数据库中，点击旁边的导入图标按钮并选择该 JSON 文件
5. 如果导入时发现同 lemma / language 的词条，系统会打开冲突审阅窗口，可逐条选择跳过或覆盖

这个 JSON 用于 Ad Fontes 词条迁移和备份，不会压平成 CSV，因此不会丢失 YAML 里的嵌套结构。

<!-- TODO: 截图 — 词表导入/导出图标 + 导入冲突审阅窗口 -->

### 9.5 Anki 连接检测

如果导出失败：

1. 打开 Settings → About 页面
2. 查看 AnkiConnect 状态是否为「已连接」（绿色圆点）
3. 如果不是，确认 Anki 正在运行且 AnkiConnect 插件已安装
4. 点击「重试」按钮

<!-- TODO: 截图 — Settings → About → AnkiConnect 状态 -->

---

## 10. 批量生成（一次搞定多个单词）

### 10.1 切换批量模式

1. 打开 AI Generate 面板
2. 点击顶部的 **Batch** 标签

### 10.2 输入单词列表

每行一个单词：

```
perseverance
ephemeral
composure
solicitude
```

或使用 `单词 | 上下文` 格式：

```
perseverance | Her perseverance through difficult times was admirable.
ephemeral | The beauty of cherry blossoms is ephemeral.
```

也可导入 JSON 文件：`{ "items": [{ "word": "...", "context": "...", "notes": "..." }] }`

### 10.3 启动批量生成

1. 选择语言
2. 点击 **Generate Batch**
3. 系统会逐条创建作业并加入队列
4. 左侧 Queue Bar 显示队列状态

<!-- TODO: 截图 — Batch 输入面板 + Queue 状态条 -->

### 10.4 监控队列

- **Queue Bar**（编辑器上方）：显示待处理/运行中/已完成数量
- **Queue Panel**（点击展开）：每个作业的状态、进度、操作按钮
- 支持暂停、恢复、取消单个或全部作业

---

## 11. 工作集（Workset）

工作集是当天生成结果的汇总视图，帮助你快速审查和批量保存。

1. 在 AI Generate 面板切换到 **Workset** 标签
2. 看到当天所有生成结果（按 Lemma + Language 去重，显示最新结果）
3. 每条结果显示评分——低分（< 6）的条目高亮提醒
4. **Save All**：批量保存所有合格词条
5. **Improve All**：对低分条目批量创建修复作业

<!-- TODO: 截图 — Workset 视图 -->

---

## 12. 软件更新（桌面版）

桌面版 Ad Fontes Manager 支持自动更新：

1. **自动检查**：启动时自动检查是否有新版本（每 24 小时最多一次）
2. **更新提醒**：发现新版本时在应用内显示非阻塞提醒
3. **自动下载**：如果你开启了自动下载，新版本会在后台下载
4. **手动检查**：Settings → About → 点击「检查更新」
5. **安装**：下载完成后，点击「安装更新」按钮——应用会关闭并启动安装程序
6. **跳过版本**：如果你不想更新到某个版本，可以点击「跳过此版本」

更新前如果有活跃的 AI 任务，应用会弹出警告。

---

## 13. 常见问题

### Anki 连不上（"disconnected"）

1. 确认 Anki 正在运行（不是最小化到托盘，是窗口真的开着）
2. 确认 AnkiConnect 插件已安装（Anki → 工具 → 附加组件 → 搜索 AnkiConnect）
3. 确认端口是 `8765`（默认不需要改）
4. 在 Settings → About 页面点击「重试」

### API Key 报 401 错误

- 检查 API Key 是否填写正确（注意不要有多余的空格）
- 检查硅基流动账户余额是否充足
- 在 Settings → API → Providers 中点击 Test 按钮确认连通性——成功会显示延迟毫秒数

### 生成到一半卡住了

- 这是正常的——pondering 阶段可能需要 1-2 分钟
- 如果超过 5 分钟没动静，点击 AI Generate 面板中的 Cancel 按钮
- 检查 Settings → API → Runtime 中的 Queue Concurrency 是否设置为 1 或以上

### YAML 编辑器报红色错误

- 红色错误列表显示的是 Schema 验证结果——字段缺失或字段位置不对
- 错误可能是语法问题（重复键、格式错误）或 Schema 问题（缺少必填字段、字段层级错误）
- 点击 **Repair** 按钮尝试自动修复格式问题
- 如果修复后仍有错误，检查字段名是否拼写正确、层级缩进是否正确
- 如果是 AI 生成的内容仍有问题，尝试点击 Improve Text 重新生成

### 生成的叙事太像 AI 写的

- 检查 Settings → API → Stages → expert 阶段的 Reasoning Effort 是否设置为 medium 或 high
- 尝试在 Generation notes 中添加更具体的约束，例如"用身体动词，不要用'体现''彰显'"
- 使用 Improve Text 在 Revision notes 中提供具体的文风修改意见

### 怎样把数据库迁移到另一台电脑

1. 在 Settings → About 页面查看「本地数据目录」路径
2. 复制该目录下的 `ad_fontes.db` 文件
3. （可选）导出 `config.json`（Settings → API → 导出配置，可选择是否包含 API Key）
4. 在新电脑的 Settings 中将数据目录指向复制后的位置
5. 重启应用

---

## 附录：快捷键与界面速查

| 操作         | 方式                        |
| ------------ | --------------------------- |
| 打开 AI 生成 | 工具栏 AI Generate 按钮     |
| 保存当前词条 | `Ctrl+S` 或工具栏 Save 按钮 |
| 格式修复     | 工具栏 Repair 按钮          |
| 搜索词条     | 右侧列表顶部搜索框          |
| 排序词条     | 工具栏 Sort 下拉            |
| 切换语言     | 顶部国旗图标                |
| 切换主题     | 顶部调色板图标              |
| 打开设置     | 侧边栏齿轮图标              |
| 检查更新     | Settings → About → 检查更新 |
