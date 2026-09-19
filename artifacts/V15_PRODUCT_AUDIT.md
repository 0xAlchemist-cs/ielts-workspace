# V15 PRODUCT AUDIT REPORT — IELTS Active Learning Workspace

审计日期 2026-09-19 · 模式 AUDIT ONLY（零代码改动）· 证据来源：全量路由/组件/API 扫描 + 数据库真实使用计数 + 引用图分析

---

## 第一部分：Product Core

这是一个**个人 IELTS 学习证据系统**：真题练习在外部完成（IELTSCB / 外部教练），工作区负责把练习结果变成可检索的证据——错题、同义替换、表达、遗忘曲线——并用它们决定你明天复习什么、读什么、写什么。产品的心脏是 Retrieval（261 次复习）与 Mission（45 天任务），不是题库也不是 AI 对话。一切页面的存在理由只有一个：让"看到过的东西"变成"能提取、能使用、能保持"的能力。

---

## 第二部分：Feature Inventory

使用数据为 2026-09-08 ~ 09-19 的 12 天真实使用（用户 id 8）。

| Feature | Route | Role | Core Loop | Frequency | Value | Complexity | Recommendation |
|---|---|---|---|---|---|---|---|
| Today Mission | `/` | 每日任务编排 + 表达卡 | 闭环起点/终点 | Daily ✓45天 | 高 | 275+服务 | **A CORE** |
| Learning Session | `/session` | 单流引导执行 | Mission 执行层 | Daily | 高 | 132+view | **A CORE** |
| Review (Retrieval) | `/review` | 闭卷产出式复习 | 检索核心 | Daily ✓261次 | 极高 | 417+双引擎 | **A CORE**（引擎双实现需合并，P1） |
| IELTSCB Import | `/library?add` + 2 API | 报告→证据 | 外部结果入口 | 每次外部练习 ✓1次 | 极高 | 中 | **A CORE** |
| Reading Report | `/ielts/report/[id]` | 错题证据分析 | Evidence 展示 | 每次导入 | 高 | 157+503 | **A CORE** |
| External Practice 区 | `/ielts` 顶部 | 外部练习大门 | 闭环起点 | 每次外部练习 | 高 | 小 | **A CORE** |
| Reading Lab | `/read/[id]` | 输入+Noticing | Input/Notice | 每次任务 ✓196次阅读 | 极高 | 918+614 | **A CORE** |
| Listening Lab | `/listen/[id]` | 听力输入 | Input | 每周数次 | 高 | 1132 | **A CORE**（shadowing/misses 阶段 0 使用，P2 观察） |
| Writing Lab | `/writing` | 写作+AI反馈+重写 | Output | ✓14次 | 高 | 1115 | **A CORE** |
| Error Bank | `/errors` | 错误归集+复仇 | Error→Review | ✓10错误 | 极高 | 325 | **A CORE** |
| Library | `/library` | 语料库+导入 | Input 供给 | 每周 | 高 | 51+371+347+299 | **A CORE** |
| Planner/Priority/Selection/Readiness/Memory计算 | services | 后台智能 | 全闭环 | 自动 | 极高 | 大 | **A CORE（后台）** |
| Chunk Bank | `/chunks` | 个人语言库+深加工 | Deep Processing | ✓47 chunks | 高 | 108+351 | **A CORE**（留在 More） |
| **AI Lab** | `/lab` | 任意句子8维分析 | **无闭环位置** | 理论上偶尔 | **与阅读Lab重复** | 26+125 | **E REMOVE** |
| **内部 Speaking Lab** | `/speaking` | 站内口语录音+AI反馈 | Output(被外包) | **0使用·0入口** | 已由外部GPT替代 | 395 | **E REMOVE** |
| **Onboarding** | `/onboarding` | 旧首访表单 | 无 | **0入口** | 被 /welcome 取代 | 254 | **E REMOVE** |
| Learning Memory 页 | `/memory` | 洞察展示 | Memory 展示层 | 每周 | 中 | 11+200 | **C MERGE → Progress** |
| Learning Profile | `/profile` | 画像+轨迹+readiness+14天趋势+效率+周回顾 | 展示 | 每周 | 中高 | 80+670 | **A CORE**（吸收 Memory，砍数据墙，P1） |
| External Hub | `/external` | 教练卡+记录表单 | 外部入口 | **表单0使用** | 与 /ielts ExternalPractice 重复 | 60+273 | **C MERGE → /ielts**（记录表单 E REMOVE） |
| IELTS Engine（站内逐项练习） | `/ielts` 引擎区 | 技能训练+证据 | Practice | ✓4次attempt | 中 | 460 | **B BACKGROUND→保留在 /ielts**（降位，外部为主） |
| CET-4/6 全层 | `/cet`+3API+fixtures | 第二考试产品 | — | **0使用** | 潜在目标 | 1151+表 | **B BACKGROUND**（IELTS 下已自动隐藏，保留能力） |
| 死 API ×4 | `/api/progress` `/api/trajectory` `/api/missions/today` `/api/contents` | — | — | **0消费者** | 无 | 4 route | **E REMOVE** |
| Mock 遗留 | `/ielts/mock` | 已重定向 | — | — | — | 8行 | V14.2 已处理 ✓ |
| Welcome 流 | `/welcome/*` | 首访引导 | Onboarding | 一次性 | 必要 | 424 | **A CORE**（保留） |

---

## 第三部分：Kill List

**删除（E REMOVE）：**
1. **AI Lab `/lab`**（页面+form，151 行）——一个文本框调 `/api/ai/sentence`，能力已内嵌在阅读 Lab 划句分析（同一条 API 三个消费者里它是唯一无上下文的）；不写 Evidence、不进 Memory/Planner；纯 AI showcase。删除后 `/lab` 重定向 `/`。`/api/ai/sentence` 保留（阅读 Lab 在用）。
2. **内部 Speaking Lab `/speaking`**（395 行 + hooks 部分依赖）——**零入口孤儿路由**（sidebar Speaking 指向 /external）；speaking_attempts 仅 1 条测试数据；口语已明确外包外部 GPT。Web Speech hooks 仍被 Listening Lab 使用，**只删页面不删 hooks**。
3. **Onboarding `/onboarding`**（254 行）——零入口，被 welcome 流取代。
4. **死 API 四条**——`/api/progress`、`/api/trajectory`、`/api/missions/today`、`/api/contents`：全站 0 个消费者（页面都是 Server Component 直读服务层）。
5. **External Sessions 记录表单**（/external 页内的 Log Session 表单）——external_sessions 表 **0 行**，12 天无一次使用；表单随 /external 合并删除，**表保留**（历史数据）。

**合并（C MERGE）：**
6. `/memory` → `/profile`：Learning Memory 的五类洞察成为 Progress 页一个区块（"What your evidence says"），`/memory` 重定向 `/profile#memory`；planner 注入逻辑不变。
7. `/external` → `/ielts`：教练卡信息已被 ExternalPractice 区覆盖；`/external` 重定向 `/ielts`。

**外包（D EXTERNALIZE，已完成确认）：**
8. Full Mock → IELTSCB（V14.2 ✓）；口语练习 → 外部 GPT（✓）；`/api/ai/speaking` 的三个消费者删掉孤儿后剩阅读/听力 Lab 的 Speaking Transfer（站内产出练习，保留）。

**保留但降位（B BACKGROUND）：**
9. IELTS Engine 站内逐项练习：保留在 `/ielts` 引擎区（外部练习区下方），它消化导入证据、产出 attempts。
10. CET 层：0 使用但属于用户的第二考试目标能力，IELTS 档案下完全隐藏、零认知负担；表/引擎/测试保留，不再投入。

---

## 第四部分：Keep List（长期核心）

闭环链：**Today Mission → Session → Reading/Listening Lab（输入+注意）→ Deep Processing（Chunk Bank）→ Review（检索）→ Writing（使用）→ Error Bank（复仇）→ Memory/Planner（调度）→ IELTSCB Import + External Practice + Report（外部证据）**。后台智能全家桶（Planner、Priority、Content Selection、Readiness、Learning Memory 计算、Content Intelligence、Prompt Resolver、Retrieval Format Engine、Forgetting Detection）全部保留——它们正是"内部学习智能"。

---

## 第五部分：Navigation Proposal

```
今日 Today (/)        —— 每天第一眼：做什么、为什么
练习 Practice (/review) —— 凭记忆提取
内容库 Library (/)     —— 语料 + 导入报告
进步 Progress (/profile) —— 合并 Memory；唯一"看数据"的地方
MORE（折叠）:
  雅思练习 (/ielts)     —— 外部练习大门 + 报告列表 + 站内引擎
  写作 (/writing)
  惯犯错误 (/errors)
  语言库 (/chunks)
设置（页脚，不变）
```
导航从 5+7 收缩为 **4+4**；删除项：Memory（合并）、Speaking（合并入 /ielts）、AI Lab（删除）；CET 保持按考试目标自动显隐。

---

## 第六部分：User Journey Before / After

**① 首次打开**：Before：tour 结束后 12 个 nav 项（含 AI Lab、Memory、Speaking…）。After：4 个主入口 + 一句话"系统已按你的水平排好今天"。
**② 20 分钟学习**：Before：首页→（可能点开 Memory/Profile 看一眼）→Continue→Session。After：唯一按钮 Continue，直达。
**③ IELTSCB 做完 Reading**：Before：回首页→想不起入口→Library→切 Add 标签。After：IELTS 页"导入练习报告"C TA 直达（或首页轻提示）→粘贴→报告。
**④ 连续几天后回来**：Before：Mission 里 56 项积压（曾发生）＋多个页面可看。After：rescue 模式缩量任务 + Progress 一页看懂"哪些变牢了"。
**⑤ "我最近哪里进步了？"**：Before：Memory、Profile、首页进度条三处找。After：Progress 单页（洞察区块 + 漏斗 + readiness），每行带 Why?。

---

## 第七部分：Architecture Impact

| 删除项 | route | component | API | DB | service | test | 依赖检查 |
|---|---|---|---|---|---|---|---|
| AI Lab | `/lab`→redirect `/` | lab/page+form (151行) | `/api/ai/sentence` **保留**（read/listen 在用） | 无 | 无 | 无专属 | 安全 |
| Speaking Lab | `/speaking`→redirect `/ielts` | speaking/lab (395行) | `/api/ai/speaking` **保留**（read/listen Transfer 在用） | 无（历史1行保留） | 无 | 无专属 | hooks/speech.ts **保留**（Listening 用）；安全 |
| Onboarding | `/onboarding`→redirect `/welcome` | form (227行) | 无 | 无 | 无 | 无 | 安全 |
| 死 API ×4 | — | — | 4 route 删除 | 无 | 服务层都在（页面直用） | 无 | 已验证 0 消费者；安全 |
| External 页合并 | `/external`→redirect `/ielts` | external/view 中的教练卡迁移/删除，Log 表单删除 | 无 | external_sessions 表保留 | 无 | 无 | /api/export 不涉及；安全 |
| Memory 合并 | `/memory`→redirect `/profile#memory` | memory/view (200行) 迁为 profile 区块 | 无 | 无 | learning-memory.ts **保留**（planner 依赖） | test:memory 改断言路径 | 安全，需迁移 UI |

**不可删除（被核心依赖）**：`/api/ai/sentence`、`/api/ai/speaking`、hooks/speech.ts、learning-memory 服务、retrieval 双引擎（P1 合并而非删除）、ielts_tasks/attempts、全部 verify 套件所覆盖的引擎。

---

## 第八部分：V15 Implementation Plan

**P0（必须收缩）**：删 AI Lab、删内部 Speaking 页、删 Onboarding、删 4 条死 API、/external→/ielts 合并（含 Log 表单下线）、/memory→/profile 合并、导航收缩为 4+4、topbar SECTION_MAP 同步、7 条重定向兜底、verify 套件同步（test:ieltscb 加导航断言；无套件直接引用被删页面）。
**P1（核心体验）**：Progress 页去数据墙（14天趋势×效率×周回顾三卡收敛为一行一 Why?）；Review 双队列实现合并为 retention.ts 单实现；首页在"有未导入的外部练习"时给一条轻提示（基于 ieltscb 最近导入时间，不新增系统）。
**P2（以后可做）**：progress_events 空表清理（需迁移评估）；Listening Lab 的 shadowing/misses 阶段低使用观察后再决定简化；CET 层冻结维护（bug fix only）。

---

## 附：删除/隐藏/合并清单（逐项判定）

| Feature | Why | Impact | Dependencies | Safe to remove? | Migration? |
|---|---|---|---|---|---|
| AI Lab `/lab` | 纯展示、与阅读Lab重复、零证据 | 151 行 + nav 1 项 | api/ai/sentence 独立保留 | **YES** | redirect `/` |
| Speaking Lab `/speaking` | 0入口0使用、已外包 | 395 行 + nav 0 项 | hooks 保留 | **YES** | redirect `/ielts` |
| Onboarding `/onboarding` | 被 welcome 取代、0入口 | 254 行 | 无 | **YES** | redirect `/welcome` |
| 死 API ×4 | 0 消费者 | 4 route | 无 | **YES** | 无 |
| External 页 | 与 ExternalPractice 重复；表单 0 使用 | 页面合并 | external_sessions 表保留 | **YES** | redirect `/ielts` |
| Memory 页 | 与 Progress 同为"看学习" | 页面合并 | learning-memory 服务保留 | **YES** | UI 迁入 profile |
| Review 双队列 | 两套实现维护成本 | 代码合并 | review API 用 retention 版 | YES（合并非删除） | P1 |
| Mock 残留 | V14.2 已完成 | 仅剩 redirect 页 | — | 已处理 | — |
| CET 层 | 0 使用但为第二目标能力 | 零 UI 负担 | 考试切换器 | **NO**（保留冻结） | 无 |
| Listening shadow/misses 阶段 | 0 记录 | 观察中 | — | NO（暂留） | P2 评估 |

**原则回执**：Less feature, more learning · AI 是能力不是产品 · 外部练习、内部学习智能 · 每个主要动作都应创造学习证据。V15 做减法：−4 页面、−4 API、−1189 行展示代码、导航 12→8。
