# Word Disclosure 搜索来源

生成单词笔记时，普通词源网站只能用来确认来路。正文需要作品里的使用场景，所以必须继续找文学或艺术作品的原文。

## 搜索顺序

1. 先查词源和早期来源。可以用词典、OED 类资料、Etymonline、Wiktionary 或其他词源资料确认大致路线。
2. 接着找文学或艺术作品。优先找能读到原文的地方。
3. 如果某个网站只说这个词出现在哪部作品里，却没有给出原文句子，或者上下文太短，继续搜索那部作品的全文。
4. 如果只能找到作品名，找不到可靠原文，就不要把它当成主要显义来源。可以把它放进候选来源，正文另选有原文可读的作品。

## 常用入口

- Project Gutenberg: 适合查公版英语文学全文。能在线阅读，也能下载文本。
- Internet Archive Texts: 适合查书籍扫描、旧版文学、期刊和难找的版本。
- HathiTrust: 适合查大规模数字馆藏；有些书只能检索到页码或片段，但仍可帮助定位版本。
- Google Books Advanced Search: 适合按精确短语、作者、题名、年代范围找书；优先选择 full view。
- Perseus Digital Library: 适合古希腊、拉丁作品，例如 Homer、Ovid、Virgil 等。需要时同时看原文和英译。
- Open Source Shakespeare 或 Folger Shakespeare: 适合查 Shakespeare 原文。
- Poetry Foundation、poets.org、Bartleby、Luminarium: 适合查诗歌、散文和早期英语文学。使用前确认页面给出了正文，而不只是简介。

## 搜索方法

先用宽搜索找到候选作品，再用窄搜索追原文：

- `"word" "author"`
- `"word" "title"`
- `"word" "Project Gutenberg"`
- `"word" "Internet Archive"`
- `"word" "HathiTrust"`
- `"word" "Google Books"`
- `"word" site:gutenberg.org`
- `"word" site:archive.org/details`
- `"word" site:perseus.tufts.edu`

如果词形变化多，搜索 lemma、变形和相近拼写。古英语、中古英语、拉丁、希腊来源不要只搜现代拼写。

## 原文判断

把一个来源作为主要显义来源前，至少确认三件事：

- 能看到原文句子，最好能看到前后几句。
- 作品本身适合展开这个词；如果只是偶然出现一次，就继续找别的来源。
- 这个用法能帮助正文写出具体处境、动作或人物关系。

如果原文上下文太少，继续找别的版本。不要根据一个孤立句子硬写故事。

处理古希腊、拉丁、古英语等文本时，优先保留一小段原文，再给出可信英译和自己的中文转述。原文只取真正参与分析的几行，不要整段搬运。中文转述要服务于正文，不要写成学术注释。

## 记录方式

properties 里只记录简短来源名：

```yaml
revelatory_sources:
  primary: "King Lear"
  candidates:
    - "King Lear"
    - "Paradise Lost"
earliest_source: "Middle English / Old French lineage"
```

正文里不写检索过程。只有当来源有不确定性时，才用轻一点的说法。
