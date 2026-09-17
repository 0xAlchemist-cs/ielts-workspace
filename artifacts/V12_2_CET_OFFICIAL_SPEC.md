# V12.2 CET Official Spec

Retrieval date: 2026-09-18 · Source: 中国教育考试网 (China National Education Examinations Authority) — [cet.neea.edu.cn](https://cet.neea.edu.cn/)

## Sources

1. **官方考试大纲**：《全国大学英语四、六级考试大纲（2016年修订版）》 — [PDF](https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf)（12MB，官方试卷结构表所在）
2. **CET 笔试专栏** — [cet.neea.edu.cn/xhtml1/folder/16113/1586-1.htm](https://cet.neea.edu.cn/xhtml1/folder/16113/1586-1.htm)
3. **2026 上半年考试安排** — [笔试时间通知](https://cet.neea.edu.cn/xhtml1/report/2603/2-1.htm)

## Written-test structure (per the 2016-revision official syllabus)

Both CET-4 and CET-6 have the **same four sections** with the **same weights**; they differ in difficulty, text length, and listening complexity.

| Section | Weight | CET-4 detail | CET-6 detail |
|---|---|---|---|
| 写作 Writing | 15% | 短文写作 (essay, 30 min) | 短文写作 (essay, 30 min) |
| 听力理解 Listening | 35% | 短篇新闻 3 段 + 长对话 2 篇 + 听力篇章 3 篇 (25 min) | 长对话 2 篇 + 听力篇章 2 篇 + 讲座/讲话 3 篇 (30 min) |
| 阅读理解 Reading | 35% | 选词填空 + 长篇阅读匹配 + 仔细阅读 2 篇 (40 min) | 同结构，文本更长更难 (40 min) |
| 翻译 Translation | 15% | 段落汉译英 (~140-160 汉字, 30 min) | 段落汉译英 (~180-200 汉字, 30 min) |

- **Total**: 710 scale (reported), raw scores equated to norms; 单项分: 听力、阅读、写作和翻译.
- **CET-4 duration**: 130 min; **CET-6**: 145 min per the 2026 exam schedule (historically 125/130 in some sources — the 2026 official notice lists 9:00–11:20 / 15:00–17:25).
- **425** = pass-equivalent threshold on the reported scale (per syllabus: 四级 425 达到"基础目标").
- **Oral (CET-SET)**: a separate exam — outside V12.2 scope per spec.

## Uncertainty / limitations

- The syllabus PDF is the 2016 revision — the latest officially published structure; the 2026 schedule (from the exam authority's notice) confirms the same subject lineup. No 2026-dated restructured syllabus was found, so the 2016-revision table remains the official source of truth.
- Exact per-question point values inside each section (e.g., how 248.5 splits across 25 listening questions) are in the syllabus PDF but not needed for V12.2's practice layer — we record section weights only and never convert practice results to official scores.

## Implementation constraint derived from this spec

- Sections in the engine: `writing | listening | reading | translation` — exactly these four, for both exams.
- Exam-mode timing uses the official durations (per-section timeouts are NOT officially broken out beyond the flow above; we use total duration only and label it).
- No official-question fabrication: fixtures are synthetic and labeled `synthetic_test`.
