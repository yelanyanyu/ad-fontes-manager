---
name: setup-moneta-skills
description: 初始化当前项目里的 Moneta 使用环境。首次使用 ask-yanyu、word-disclosure、phrase-disclosure、write-review、moneta-critique 或 moneta-skills-improver 前运行一次；它只检查 skills 安装完整性，并创建用户项目里的输出目录和 Moneta 说明块。
disable-model-invocation: true
---

# Setup Moneta Skills

为当前项目初始化 Moneta 使用环境。

这是一个提示驱动的 setup skill，不是固定脚本。先探索当前项目，展示已经存在和缺失的部分，逐项问用户确认，然后再写文件。

## 边界

Moneta skills 和它们的 reference 文件应当随用户下载的 skills 仓库自带。setup 只检查完整性，不创建或修补这些包内文件。

如果缺少下面任何一项，提醒用户重新安装或更新 Moneta skills：

- `ask-yanyu`
- `setup-moneta-skills`
- `word-disclosure`
- `phrase-disclosure`
- `write-review`
- `moneta-critique`
- `moneta-skills-improver`
- `word-disclosure/references/STYLE.md`
- `word-disclosure/references/SOURCES.md`
- `word-disclosure/references/CORRECTIONS.md`

## 初始化内容

- **安装完整性**：检查 Moneta skills 和 references 是否存在。
- **Obsidian 输出目录**：创建或确认 `word/`、`phrase/`，以及用户选择的写作审查目录。
- **项目说明**：在 `AGENTS.md` 或 `CLAUDE.md` 里加入 Moneta skills 说明块。

## 流程

### 1. 探索

先看当前项目，不要假设文件已经存在：

- `.agents/skills/` 下有哪些 Moneta skills。
- `word/`、`phrase/` 是否存在。
- 用户是否已有写作审查输出目录。
- 根目录的 `AGENTS.md`、`CLAUDE.md`、`CONTEXT.md`。
- `AGENTS.md` 或 `CLAUDE.md` 里是否已有 `## Moneta skills` 说明块。

如果项目里已经有这些文件，读取后再判断是否需要补齐，不要覆盖用户内容。

### 2. 展示结果

用简短中文告诉用户：

- skills 安装是否完整。
- 如果不完整，列出缺失项，并建议重新安装或更新 Moneta skills；不要尝试现场创建缺失 skill。
- 用户项目里已经有哪些输出目录。
- 缺少哪些输出目录或说明块。

不要一次抛出很多选择。按下面三段逐个确认。

### 3. 逐项确认

**第一段：安装完整性。**

如果安装不完整，先停下来，建议用户重新安装。不要继续初始化半残缺环境。

如果安装完整，进入第二段。

**第二段：输出目录。**

默认创建：

- `word/`
- `phrase/`

写作审查目录由用户命名；如果用户暂时不用写作审查，可以跳过。

说明：目录只负责保存 Obsidian Markdown 结果，不保存旧流水线 YAML。

**第三段：项目说明。**

选择写入 `AGENTS.md` 或 `CLAUDE.md`。

- 如果 `AGENTS.md` 存在，优先更新它。
- 否则如果 `CLAUDE.md` 存在，更新它。
- 两者都没有时，询问用户创建哪一个。

如果已有 `## Moneta skills` 说明块，原地更新，不重复追加。

### 4. 写入

写入前展示将要创建或修改的文件列表。用户确认后再执行。

建议的说明块：

```markdown
## Moneta skills

### 入口

使用 `/ask-yanyu` 选择下一步：初始化项目、生成单词笔记、解析词组、审查写作、质疑怪句，或改进 Moneta skills。

### 生成

使用 `/word-disclosure` 生成或更新 `word/` 目录下的 Obsidian Markdown 单词笔记。使用 `/phrase-disclosure` 生成或更新 `phrase/` 目录下的词组笔记。使用 `/write-review` 做写作审查。

### 反馈和改进

使用 `/moneta-critique` 把“不对劲”的句子追问成规则。使用 `/moneta-skills-improver` 把确认后的规则反哺到 Moneta skills，并维护纠错样本。
```

### 5. 完成

告诉用户初始化完成，并列出：

- 创建或补齐了哪些目录。
- 更新了哪个项目说明文件。
- 安装完整性检查结果。
- 当前可以使用哪些 Moneta skills。
- 如果这版结构稳定，建议 commit；需要同步到其他环境时，再 push。
