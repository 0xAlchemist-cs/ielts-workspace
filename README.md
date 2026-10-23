# IELTS Workspace — Active Learning

**The IELTS system that remembers what you actually know.**
**一个真正"记得你学会了什么"的雅思学习系统。**

[![CI](https://github.com/0xAlchemist-cs/ielts-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/0xAlchemist-cs/ielts-workspace/actions/workflows/ci.yml)

[English](#english) · [中文](#中文)

---

<a id="english"></a>
## English

### The problem

Most IELTS products track what you **complete**: questions answered, lessons finished, words "learned", streaks. Completion is not ability. You can finish a thousand exercises and still freeze in speaking; you can "learn" a word and be unable to produce it a week later.

This system is built on the opposite assumption:

> Learning is not complete when you have seen something.
> Learning is complete when you can **retrieve it, use it, transfer it, and retain it.**

### One loop, not many modules

Every day runs the same loop — modules are just environments the loop passes through:

```
Learn  →  Retrieve  →  Use      →  Retain
(input)   (from memory)  (produce)  (keep)
```

**Personal Learning Memory** is the core difference. The system records what actually happened and lets that decide what happens next:

- You made the *"discuss about"* mistake 7 times → it keeps returning in new contexts until it's dead.
- You retrieved *"play a crucial role"* successfully → it's scheduled differently from the ones you fumbled.
- You understood something in reading but never produced it → classified as **passive knowledge**, pushed toward production.
- You haven't used an expression for 30 days → a **retention check** appears.
- Every recommendation shows its reason: *"Seen 5 times. Retrieved once. Last failed 6 days ago."* — never a vague "recommended for you".

### Evidence, not scores

Progress is the honest funnel, and a number only moves down when you produce English from memory:

**Exposed → Understood → Retrieved → Used → Retained**

见过 ≠ 会检索 ≠ 会用 ≠ 已保留 — this distinction is the product's core idea. The homepage shows today's funnel every day.

Every score also carries a source and a trust level (see `src/lib/evidence.ts`):

| Evidence | Can prove | Cannot prove |
|---|---|---|
| Live AI band (writing/speaking) | ability dimensions, readiness | an official exam result |
| Deterministic grade (retrieval, IELTS practice) | practice ability | exam performance |
| Behavioral event (real use in speech/writing) | an act happened | any score |
| Self-report (external sessions) | engagement | a band, a gate |
| Offline fallback (mock AI) | nothing — practice record only | everything ability-related |

Metrics follow the same honesty: **transfer** is only "verified" when a chunk was actually produced in a new context; **retention** only after a successful check across a real interval; a **mock-only day renders no fake IELTS band** — null ("insufficient evidence"), never a fabricated number.

### Requirements and quick start

Node.js 22 (as used in CI) · npm · no external database (SQLite, embedded).

```bash
npm install
npm run db:push && npm run db:seed
npm run dev            # dev server on 127.0.0.1:3000
```

Runs fully offline with the built-in Mock AI. To unlock real LLM grading, add any OpenAI-compatible endpoint in **Settings → AI Provider**, or set `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` in `.env.local` (see [`.env.local.example`](./.env.local.example)). For the full dictionary corpus also run `npm run db:dict` (needs `data/ecdict.csv`, see the production install below).

Production install:

```bash
npm ci
curl -L -o data/ecdict.csv   https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o data/lemma.en.txt https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt
npm run db:push && npm run db:seed && npm run db:dict
npm run build && npm run start   # binds 127.0.0.1:3000
```

### A day looks like this

1. Open **Today** — the system names one focus and *why* (three concrete evidence points), plus what this session will change.
2. Run the mission: read/listen real Cambridge material → notice expressions in context → retrieve them closed-book → produce them in writing & speaking.
3. Mistakes land in **Your Recurring Mistakes** and return as parallel drills in new contexts.
4. End of day: the evidence funnel updates; trends shift; tomorrow's plan changes accordingly.

### Bring your own materials

Your English isn't only in Cambridge books — it's in PDFs you saved, podcast episodes, interview recordings, articles in Word. Drop any of it into the Library: PDF, Word, text, Markdown, subtitles, a photo of a page, an MP3 you recorded. It becomes a real learning resource — analysed, deduped (full-text fingerprint), and wired straight into the same daily loop as the built-in corpus. Everything runs locally; nothing is uploaded anywhere.

### The environments

| | |
| --- | --- |
| **External practice** | Real exams happen on external sites (IELTSCB for reading/full papers, your AI coach for speaking/listening); paste the report link back in and it becomes learning evidence |
| **Reading** | Guess-first word cards, 8-dimension sentence analysis, article-first workbench |
| **Listening** | Real Cambridge audio, segment-level control, connected-speech annotation, shadowing |
| **Writing** | Task → Plan → Write (instant local feedback + AI examiner) → Rewrite → Transfer |
| **Speaking** | Your external coach; the workspace stores what happened and feeds it back into the loop |
| **Review** | "Think first" — produce from memory, never flip flashcards |

### Corpus (v1-corpus-complete)

Listening **249 sections / 2267 questions** (Cambridge 5–20, transcript-verified) · Reading **234 exams / 3147 questions** · Writing **T1 315 + T2 259** · 37 bilingual model essays · 657 graded contents · 8413 vocabulary entries · 23 contrast grammar patterns. All importers idempotent (`npm run db:*`). Third-party material is personal-use only.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server on 127.0.0.1:3000 |
| `npm run verify:all` | full gate: 40+ suites (lint, tsc, every product/security/data regression) |
| `node scripts/with-test-db.mjs npm run verify:all` | the same gate on an **isolated snapshot** of the database — the sanctioned way; the pre-push hook and CI use exactly this |
| `npm run db:migrate` | apply versioned migrations (refuses `data/app.db` without `--yes-production`; snapshots first — see [docs/migrations.md](./docs/migrations.md)) |
| `npm run db:push` | schema push for **throwaway** databases only — guarded, refuses an existing `data/app.db` |

### Data safety contract

- Automated gates **can never write the production database**: they run on a WAL-consistent `VACUUM INTO` snapshot with `IELTS_ENFORCE_TEST_ISOLATION` enforced at the db layer — a gate that loses its isolation setting refuses to run instead of silently landing on `data/app.db`.
- Schema evolution is versioned, rehearsed and recoverable: every migration run writes a pre-migration snapshot; rollback = stop the app, copy the snapshot back.
- Your learning history is an asset: nothing here deletes or rewrites it for "cleanliness".

### Under the hood

Next.js 16 (App Router, server actions) · TypeScript · Tailwind v4 · Drizzle + SQLite (local-first, WAL) · zod-validated AI adapter (deterministic Mock offline / any OpenAI-compatible endpoint live, silent fallback) · Web Speech + MediaRecorder · Apple-inspired calm design system, bilingual 中英/沉浸, dark mode.

### Development workflow (read before your first push)

**Every `git push` runs the full gate** (~4–5 min) via the versioned `.githooks/pre-push` hook (`git config core.hooksPath .githooks`) — now always on the isolated gate database. A red gate aborts the push.

- Push rejected? Fix the failing suite — don't reach for `--no-verify`.
- One push, one gate run: push master and tags together.
- The running app is NOT the repo: `npm run start` serves the last `npm run build` — rebuild after changing code.
- DB importers (`npm run db:*`) write `data/app.db` directly and are outside the gate — every importer carries its own idempotency/count assertions; keep them true.

### Security & backup

Single-user, loopback-only (`127.0.0.1`) · SSRF-guarded AI calls · input gates on every POST route · security headers · daily 09:30 OneDrive backup (git bundle + consistent DB snapshot, 14-day rotation).

### Documentation

- [Database migrations](./docs/migrations.md) — workflow, rehearsal, rollback
- [Backup & restore](./docs/backup-restore.md)

---

<a id="中文"></a>
## 中文

### 问题所在

大多数雅思产品统计的是你**完成了什么**：做了多少题、学了多少课、"背"了多少词、连续打卡多少天。完成不等于能力——做完一千道题开口仍可能卡壳；"学过"的词一周后未必能产出。

本系统建立在对立的假设上：

> 见过 ≠ 学会。
> 能**提取、使用、迁移、留存**，才算学会。

### 一个闭环，而非一堆模块

每天运行同一个学习闭环——模块只是闭环经过的环境：

```
输入  →  提取        →  使用      →  留存
(学习)    (凭记忆回想)    (真实产出)    (长期保持)
```

**个人学习记忆**是核心差异。系统记录真实发生的学习行为，并由它决定接下来发生什么：

- *"discuss about"* 这个错误你犯了 7 次 → 它会不断以新语境回来，直到彻底消灭。
- *"play a crucial role"* 你成功提取过 → 它的复习排期与那些你磕绊过的表达完全不同。
- 阅读里读懂但从未产出过的表达 → 归类为**被动知识**，持续推向产出。
- 30 天没用过的表达 → 出现一次**留存检查**。
- 每条推荐都给出理由：*"见过 5 次，成功提取 1 次，上次失败在 6 天前"*——绝不含糊地说"为你推荐"。

### 证据，而非分数

进度就是那条诚实的漏斗，数字只有在你凭记忆产出英语时才会前进：

**接触 → 理解 → 提取 → 使用 → 留存**

这一区分是本产品的核心思想——首页每天展示当天的证据漏斗。每个分数也都带来源与信任级别（见 `src/lib/evidence.ts`）：

| 证据 | 能证明 | 不能证明 |
|---|---|---|
| 真实 AI 评分（写作/口语） | 能力维度、备考状态 | 官方考试成绩 |
| 确定性评分（检索、真题练习） | 练习水平 | 考场表现 |
| 行为事件（口语/写作中真实使用） | 行为发生过 | 任何分数 |
| 自报记录（外部练习） | 参与度 | 分数、状态门槛 |
| 离线回落（Mock AI） | 什么都不能——仅练习记录 | 一切能力相关的事 |

指标同样诚实：**迁移**只有在真实跨情境产出后才算"已验证"；**留存**只在跨真实间隔的检查成功后计入；**只有 Mock 数据的一天不会显示假雅思分数**——返回 null（证据不足），绝不编造数字。

### 环境要求与快速开始

Node.js 22（与 CI 一致）· npm · 无外部数据库（内嵌 SQLite）。

```bash
npm install
npm run db:push && npm run db:seed
npm run dev            # 开发服务器 127.0.0.1:3000
```

内置 Mock AI，完全离线可用。要启用真实大模型评分，在**设置 → AI Provider** 填入任意 OpenAI 兼容端点，或在 `.env.local` 设置 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`（见 [`.env.local.example`](./.env.local.example)）。完整词典语料另需 `npm run db:dict`（需 `data/ecdict.csv`，见下方生产安装）。

生产安装：

```bash
npm ci
curl -L -o data/ecdict.csv   https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o data/lemma.en.txt https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt
npm run db:push && npm run db:seed && npm run db:dict
npm run build && npm run start   # 绑定 127.0.0.1:3000
```

### 一天是这样的

1. 打开**今日**——系统给出唯一焦点及其*为什么*（三条具体证据），以及本次学习会改变什么。
2. 执行任务：阅读/听真实的剑桥材料 → 在语境中注意表达 → 闭卷提取 → 在写作与口语中产出。
3. 错误进入**反复错误库**，以新语境的平行练习回归。
4. 一天结束：证据漏斗更新、趋势移动、明日计划随之改变。

### 自带你的材料

你的英语不只存在于剑桥书里——还有你存的 PDF、播客单集、面试录音、Word 文章。把任何东西拖进资料库：PDF、Word、文本、Markdown、字幕、一页纸的照片、你自己录的 MP3。它会变成真正的学习资源——被分析、全文指纹去重、接入与内置语料完全相同的每日闭环。一切都在本机运行，不上传任何东西。

### 各环境

| | |
| --- | --- |
| **外部实战** | 真实模考发生在外部站点（IELTSCB 阅读/整卷、你的 AI 教练口语/听力）；把成绩报告链接贴回来，它就成为学习证据 |
| **阅读** | 先猜词卡、8 维句子分析、以文章为核心的工作台 |
| **听力** | 剑桥真题音频、逐段控制、连读标注、跟读 |
| **写作** | 审题 → 规划 → 写作（即时本地反馈 + AI 考官）→ 重写 → 迁移 |
| **口语** | 你的外部教练；工作台记录发生了什么并回馈进闭环 |
| **复习** | "先想后翻"——凭记忆产出，绝不翻卡片 |

### 语料（v1-corpus-complete）

听力 **249 节 / 2267 题**（剑桥 5–20，逐字稿校验）· 阅读 **234 套 / 3147 题** · 写作 **T1 315 + T2 259** · 37 篇双语范文 · 657 篇分级内容 · 8413 词条 · 37 组对比语法。所有导入器幂等（`npm run db:*`）。第三方材料仅供个人使用。

### 日常命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 127.0.0.1:3000 |
| `npm run verify:all` | 完整门禁：40+ 个套件（lint、tsc、全部产品/安全/数据回归） |
| `node scripts/with-test-db.mjs npm run verify:all` | 在**隔离快照**上跑同一门禁——标准方式；pre-push 钩子与 CI 用的正是它 |
| `npm run db:migrate` | 应用版本化迁移（对 `data/app.db` 无 `--yes-production` 直接拒绝；先写快照——见 [docs/migrations.md](./docs/migrations.md)） |
| `npm run db:push` | 仅用于**一次性**数据库——受守卫保护，已存在的 `data/app.db` 会被拒绝 |

### 数据安全契约

- 自动化门禁**永远无法写入生产数据库**：门禁跑在 `VACUUM INTO` 的 WAL 一致性快照上，并在数据库层强制 `IELTS_ENFORCE_TEST_ISOLATION`——任何丢失隔离配置的测试会拒绝运行，而不是静默落到 `data/app.db`。
- 演进是版本化、可演练、可恢复的：每次迁移先写迁移前快照；回滚 = 停应用、快照拷回。
- 学习历史是资产：本仓库不会以"整洁"为由删除或改写它。

### 技术内幕

Next.js 16（App Router、Server Actions）· TypeScript · Tailwind v4 · Drizzle + SQLite（local-first、WAL）· zod 校验的 AI 适配层（离线确定性 Mock / 任意 OpenAI 兼容端点在线、静默回落）· Web Speech + MediaRecorder · Apple 风格的沉静设计系统、中英双语/沉浸模式、深色模式。

### 开发工作流（首次推送前必读）

**每次 `git push` 都会跑完整门禁**（约 4–5 分钟），经由版本化的 `.githooks/pre-push` 钩子（`git config core.hooksPath .githooks`）——现在始终在隔离门禁库上运行。门禁红了推送即中止。

- 推送被拒？修好失败的套件——不要动 `--no-verify` 的念头。
- 一次推送一次门禁：master 和标签一起推。
- 运行中的应用 ≠ 仓库：`npm run start` 服务的是上一次 `npm run build`——改完代码要重新构建。
- 数据库导入器（`npm run db:*`）直接写 `data/app.db` 且在门禁之外——每个导入器自带幂等/计数断言，请保持它们为真。

### 安全与备份

单用户、仅回环地址（`127.0.0.1`）· AI 调用 SSRF 防护 · 每个 POST 路由输入门禁 · 安全响应头 · 每天 09:30 OneDrive 备份（git bundle + 一致性数据库快照，14 天轮换）。

### 文档

- [数据库迁移](./docs/migrations.md)——工作流、演练、回滚
- [备份与恢复](./docs/backup-restore.md)
