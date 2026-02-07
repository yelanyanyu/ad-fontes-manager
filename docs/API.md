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
成功（以单词 `about` 为例）：
```json
{
    "code": 200,
    "message": "success",
    "data": {
        "lemma": "about",
        "syllabification": "a-bout",
        "other_common_meanings": [
            "Spatial Motion: Moving here and there; on all sides; to and fro.",
            "Proximity & State: Near; in the vicinity; in existence/evidence.",
            "Approximation: Nearly; approximately; almost (degree/quantity).",
            "Intention: On the point or verge of doing something (be about to).",
            "Structural: Around the outside; in a circle; surrounding."
        ],
        "image_differentiation_zh": "**About vs. Around**：\n*   **Around** 更强调几何上的“圆周”或“包围感”。画面是一个封闭的圆环（Circle）。\n*   **About** 更强调“在这里或那里”（Here and there）的随意性或“大致方位”。画面是一群蜜蜂在花朵周围无序地飞舞，或者一个人在房间里漫无目的地踱步。\n\n**About vs. Concerning**：\n*   **Concerning** 像是手指直接“触碰”到了话题，非常具体且聚焦。\n*   **About** 像是手里拿着一张网，“笼罩”在话题之上，涵盖面更广，更显一种弥散的“相关性氛围”。\n",
        "original_yaml": {
            "yield": {
                "lemma": "about",
                "user_word": "about",
                "part_of_speech": "Preposition",
                "syllabification": "a-bout",
                "contextual_meaning": {
                    "en": "Concerning; on the subject of; with regard to.",
                    "zh": "关于；涉及；针对。"
                },
                "other_common_meanings": [
                    "Spatial Motion: Moving here and there; on all sides; to and fro.",
                    "Proximity & State: Near; in the vicinity; in existence/evidence.",
                    "Approximation: Nearly; approximately; almost (degree/quantity).",
                    "Intention: On the point or verge of doing something (be about to).",
                    "Structural: Around the outside; in a circle; surrounding."
                ],
                "user_context_sentence": "We had a long discussion about the new project."
            },
            "nuance": {
                "synonyms": [
                    {
                        "word": "Around",
                        "meaning_zh": "围绕；在...四周（强调圆周运动或包围的几何形状）"
                    },
                    {
                        "word": "Concerning",
                        "meaning_zh": "关于；涉及（语气更正式，像一条直线直接指向主题）"
                    }
                ],
                "image_differentiation_zh": "**About vs. Around**：\n*   **Around** 更强调几何上的“圆周”或“包围感”。画面是一个封闭的圆环（Circle）。\n*   **About** 更强调“在这里或那里”（Here and there）的随意性或“大致方位”。画面是一群蜜蜂在花朵周围无序地飞舞，或者一个人在房间里漫无目的地踱步。\n\n**About vs. Concerning**：\n*   **Concerning** 像是手指直接“触碰”到了话题，非常具体且聚焦。\n*   **About** 像是手里拿着一张网，“笼罩”在话题之上，涵盖面更广，更显一种弥散的“相关性氛围”。\n"
            },
            "etymology": {
                "root_and_affixes": {
                    "root": "būtan (OE compound: be- + ūtan)",
                    "prefix": "a- (shortened from OE 'on')",
                    "suffix": "N/A",
                    "structure_analysis": "Composite of Old English 'on' (on) + 'be' (by) + 'ūtan' (out/outside). Literally: 'On-by-out' or 'On the outside'."
                },
                "visual_imagery_zh": "想象你正站在一座巨大的圆形古堡（物体）的边缘。\n1. 场景：你并非置身城堡内部，而是处于它的外围（Out/Utan）。\n2. 动作：你贴着（By/Be）城墙的表面，沿着（On）外圈行走。\n3. 体感：你感受到城墙的粗糙质感就在手边，你不停地绕圈（Moving about），从各个角度观察它，但始终保持在它的外部边界上。\n这种“贴着外圈游走”的体验，就是 about 最原始的“周围、环绕”之感。\n",
                "historical_origins": {
                    "pie_root": "PIE *an (on) + *bhi (by) + *ud (out)",
                    "source_word": "Old English 'onbūtan' / 'ābūtan'",
                    "history_myth": "N/A"
                },
                "meaning_evolution_zh": "从“绕着外圈走”的具体画面演变如下：\n1. **空间位置**：因为你在外圈，所以你在“附近”（Near/Vicinity），且在“四周”（All around）。\n2. **数量估算**：当你说“About 50”时，就像你的箭射在了靶心“50”的周围一圈，虽未正中红心，但落在“附近”。\n3. **抽象话题**：当你谈论“About a topic”时，你的思维在围绕着这个话题打转，从各个侧面去审视它，涵盖它的周边信息（Concerning），就像包裹着它一样。\n"
            },
            "application": {
                "selected_examples": [
                    {
                        "type": "Literal / Root Image",
                        "sentence": "He wrapped his cloak about him against the cold.",
                        "translation_zh": "他把斗篷紧紧裹在身上御寒。（直义：在身体外围环绕一圈）"
                    },
                    {
                        "type": "Current Context",
                        "sentence": "We had a long discussion about the new project.",
                        "translation_zh": "我们就新项目进行了长谈。（抽象：思维围绕着项目这个中心话题）"
                    },
                    {
                        "type": "Abstract / Metaphorical",
                        "sentence": "I was about to leave when the phone rang.",
                        "translation_zh": "我正要离开时电话响了。（意图：正处于离开这一动作的边缘/附近）"
                    }
                ]
            },
            "cognate_family": {
                "cognates": [
                    {
                        "word": "Out",
                        "logic": "源自 PIE *ud-。直接对应 about 中的 -ut 部分，表示“向外、外部”的方位感。"
                    },
                    {
                        "word": "But",
                        "logic": "源自 Old English 'butan' (be + utan)。原意是“在...之外/除去...”。About 是“在外部游走”，But 是“被排除在外部”。"
                    },
                    {
                        "word": "By",
                        "logic": "源自 PIE *bhi。对应 about 中的 -b- 部分。表示“贴近、在旁边”，提供了“紧邻”的距离感。"
                    }
                ],
                "instruction": "请在本板块使用中文。选择 3-4 个同源词。"
            }
        },
        "etymology": {
            "prefix": "a- (shortened from OE 'on')",
            "root": "būtan (OE compound: be- + ūtan)",
            "suffix": "N/A",
            "structure_analysis": "Composite of Old English 'on' (on) + 'be' (by) + 'ūtan' (out/outside). Literally: 'On-by-out' or 'On the outside'.",
            "history_myth": "N/A",
            "source_word": "Old English 'onbūtan' / 'ābūtan'",
            "pie_root": "PIE *an (on) + *bhi (by) + *ud (out)",
            "visual_imagery_zh": "想象你正站在一座巨大的圆形古堡（物体）的边缘。\n1. 场景：你并非置身城堡内部，而是处于它的外围（Out/Utan）。\n2. 动作：你贴着（By/Be）城墙的表面，沿着（On）外圈行走。\n3. 体感：你感受到城墙的粗糙质感就在手边，你不停地绕圈（Moving about），从各个角度观察它，但始终保持在它的外部边界上。\n这种“贴着外圈游走”的体验，就是 about 最原始的“周围、环绕”之感。\n",
            "meaning_evolution_zh": "从“绕着外圈走”的具体画面演变如下：\n1. **空间位置**：因为你在外圈，所以你在“附近”（Near/Vicinity），且在“四周”（All around）。\n2. **数量估算**：当你说“About 50”时，就像你的箭射在了靶心“50”的周围一圈，虽未正中红心，但落在“附近”。\n3. **抽象话题**：当你谈论“About a topic”时，你的思维在围绕着这个话题打转，从各个侧面去审视它，涵盖它的周边信息（Concerning），就像包裹着它一样。\n"
        },
        "cognates": [
            {
                "cognate_word": "Out",
                "logic": "源自 PIE *ud-。直接对应 about 中的 -ut 部分，表示“向外、外部”的方位感。"
            },
            {
                "cognate_word": "But",
                "logic": "源自 Old English 'butan' (be + utan)。原意是“在...之外/除去...”。About 是“在外部游走”，But 是“被排除在外部”。"
            },
            {
                "cognate_word": "By",
                "logic": "源自 PIE *bhi。对应 about 中的 -b- 部分。表示“贴近、在旁边”，提供了“紧邻”的距离感。"
            }
        ],
        "examples": [
            {
                "example_type": "Literal / Root Image",
                "sentence": "He wrapped his cloak about him against the cold.",
                "translation_zh": "他把斗篷紧紧裹在身上御寒。（直义：在身体外围环绕一圈）"
            },
            {
                "example_type": "Current Context",
                "sentence": "We had a long discussion about the new project.",
                "translation_zh": "我们就新项目进行了长谈。（抽象：思维围绕着项目这个中心话题）"
            },
            {
                "example_type": "Abstract / Metaphorical",
                "sentence": "I was about to leave when the phone rang.",
                "translation_zh": "我正要离开时电话响了。（意图：正处于离开这一动作的边缘/附近）"
            }
        ],
        "synonyms": [
            {
                "synonym_word": "Around",
                "meaning_zh": "围绕；在...四周（强调圆周运动或包围的几何形状）"
            },
            {
                "synonym_word": "Concerning",
                "meaning_zh": "关于；涉及（语气更正式，像一条直线直接指向主题）"
            }
        ]
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
- 仅基础信息：`GET /api/words/details?word=about`

```json
{
    "code": 200,
    "message": "success",
    "data": {
        "lemma": "about",
        "syllabification": "a-bout",
        "other_common_meanings": [
            "Spatial Motion: Moving here and there; on all sides; to and fro.",
            "Proximity & State: Near; in the vicinity; in existence/evidence.",
            "Approximation: Nearly; approximately; almost (degree/quantity).",
            "Intention: On the point or verge of doing something (be about to).",
            "Structural: Around the outside; in a circle; surrounding."
        ],
        "image_differentiation_zh": "**About vs. Around**：\n*   **Around** 更强调几何上的“圆周”或“包围感”。画面是一个封闭的圆环（Circle）。\n*   **About** 更强调“在这里或那里”（Here and there）的随意性或“大致方位”。画面是一群蜜蜂在花朵周围无序地飞舞，或者一个人在房间里漫无目的地踱步。\n\n**About vs. Concerning**：\n*   **Concerning** 像是手指直接“触碰”到了话题，非常具体且聚焦。\n*   **About** 像是手里拿着一张网，“笼罩”在话题之上，涵盖面更广，更显一种弥散的“相关性氛围”。\n"
    }
}
```


- 词源+例句：`GET /api/words/details?word=about&include=etymology,examples`

```json
{
    "code": 200,
    "message": "success",
    "data": {
        "lemma": "about",
        "syllabification": "a-bout",
        "other_common_meanings": [
            "Spatial Motion: Moving here and there; on all sides; to and fro.",
            "Proximity & State: Near; in the vicinity; in existence/evidence.",
            "Approximation: Nearly; approximately; almost (degree/quantity).",
            "Intention: On the point or verge of doing something (be about to).",
            "Structural: Around the outside; in a circle; surrounding."
        ],
        "image_differentiation_zh": "**About vs. Around**：\n*   **Around** 更强调几何上的“圆周”或“包围感”。画面是一个封闭的圆环（Circle）。\n*   **About** 更强调“在这里或那里”（Here and there）的随意性或“大致方位”。画面是一群蜜蜂在花朵周围无序地飞舞，或者一个人在房间里漫无目的地踱步。\n\n**About vs. Concerning**：\n*   **Concerning** 像是手指直接“触碰”到了话题，非常具体且聚焦。\n*   **About** 像是手里拿着一张网，“笼罩”在话题之上，涵盖面更广，更显一种弥散的“相关性氛围”。\n",
        "etymology": {
            "prefix": "a- (shortened from OE 'on')",
            "root": "būtan (OE compound: be- + ūtan)",
            "suffix": "N/A",
            "structure_analysis": "Composite of Old English 'on' (on) + 'be' (by) + 'ūtan' (out/outside). Literally: 'On-by-out' or 'On the outside'.",
            "history_myth": "N/A",
            "source_word": "Old English 'onbūtan' / 'ābūtan'",
            "pie_root": "PIE *an (on) + *bhi (by) + *ud (out)",
            "visual_imagery_zh": "想象你正站在一座巨大的圆形古堡（物体）的边缘。\n1. 场景：你并非置身城堡内部，而是处于它的外围（Out/Utan）。\n2. 动作：你贴着（By/Be）城墙的表面，沿着（On）外圈行走。\n3. 体感：你感受到城墙的粗糙质感就在手边，你不停地绕圈（Moving about），从各个角度观察它，但始终保持在它的外部边界上。\n这种“贴着外圈游走”的体验，就是 about 最原始的“周围、环绕”之感。\n",
            "meaning_evolution_zh": "从“绕着外圈走”的具体画面演变如下：\n1. **空间位置**：因为你在外圈，所以你在“附近”（Near/Vicinity），且在“四周”（All around）。\n2. **数量估算**：当你说“About 50”时，就像你的箭射在了靶心“50”的周围一圈，虽未正中红心，但落在“附近”。\n3. **抽象话题**：当你谈论“About a topic”时，你的思维在围绕着这个话题打转，从各个侧面去审视它，涵盖它的周边信息（Concerning），就像包裹着它一样。\n"
        },
        "examples": [
            {
                "example_type": "Literal / Root Image",
                "sentence": "He wrapped his cloak about him against the cold.",
                "translation_zh": "他把斗篷紧紧裹在身上御寒。（直义：在身体外围环绕一圈）"
            },
            {
                "example_type": "Current Context",
                "sentence": "We had a long discussion about the new project.",
                "translation_zh": "我们就新项目进行了长谈。（抽象：思维围绕着项目这个中心话题）"
            },
            {
                "example_type": "Abstract / Metaphorical",
                "sentence": "I was about to leave when the phone rang.",
                "translation_zh": "我正要离开时电话响了。（意图：正处于离开这一动作的边缘/附近）"
            }
        ]
    }
}
```


- 全量：`GET /api/words/details?word=about&include=etymology,cognates,examples,synonyms,rawyaml`
略。

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
