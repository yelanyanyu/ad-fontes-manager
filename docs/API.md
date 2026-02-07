# API 文档

本文档汇总项目对外 API 的接口说明、参数与返回、示例请求以及测试脚本入口。

## 查询单词详情（对外接口）
- Endpoint: `GET /api/words/details`
- Method: `GET`
- Description: 根据单词文本（lemma）查询基础信息，并通过 `include` 参数按需返回词源、同源词、例句、近义词及原始 YAML。

### 请求参数
- `word`（string，必填）：要查询的单词（大小写不敏感）
- `include`（string，选填）：逗号分隔，可选值为 `etymology,cognates,examples,synonyms,rawyaml`

### 返回结构（标准信封）
成功：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "lemma": "bolster",
    "syllabification": "bol-ster",
    "other_common_meanings": ["支撑", "加强"],
    "image_differentiation_zh": "画面感辨析...",
    "etymology": {
      "prefix": "...",
      "root": "...",
      "suffix": "...",
      "structure_analysis": "...",
      "history_myth": "...",
      "source_word": "...",
      "pie_root": "*bhel-",
      "visual_imagery_zh": "...",
      "meaning_evolution_zh": "..."
    },
    "cognates": [
      { "cognate_word": "ball", "logic": "同源圆形根" }
    ],
    "examples": [
      { "example_type": "Current Context", "sentence": "We must bolster our defenses.", "translation_zh": "我们必须加强防御。" }
    ],
    "synonyms": [
      { "synonym_word": "strengthen", "meaning_zh": "加强" }
    ],
    "original_yaml": { "yield": { "lemma": "bolster" } }
  }
}
```

失败：
```json
{ "code": 400, "message": "Word parameter required" }
{ "code": 404, "message": "Not found" }
{ "code": 500, "message": "Internal Server Error" }
```

### 示例请求
- 仅基础信息：`GET /api/words/details?word=bolster`
- 词源+例句：`GET /api/words/details?word=bolster&include=etymology,examples`
- 全量：`GET /api/words/details?word=bolster&include=etymology,cognates,examples,synonyms,rawyaml`

---

## 添加单词（严格校验）
- Endpoint: `POST /api/words/add`
- Method: `POST`
- Description: 根据 `word` 与 `yaml` 添加单词。先检测重复，再严格校验 YAML 结构与字段，最后写入数据库。

### 请求参数
- `word`（string，必填）：单词（大小写不敏感）
- `yaml`（string，必填）：完整 YAML 内容

### 返回码设计
- 201：新增成功
- 409：单词重复（不写入数据库）
- 422：YAML 不符合标准格式

成功：
```json
{ "code": 201, "message": "created", "data": { "id": "uuid", "lemma": "aggregate" } }
```

重复：
```json
{ "code": 409, "message": "Duplicate word", "data": { "lemma": "bid" } }
```

格式错误：
```json
{ "code": 422, "message": "Invalid YAML", "data": { "errors": ["yield.lemma is required"] } }
```

### 测试脚本
在后端目录执行：
```bash
node scripts/test-add-word.mjs
```
