# V14 — IELTSCB Reading URL Import（真题外包，弱点分析内留）

**日期** 2026-09-19 · **提交** 0e4a55f · **验证** verify:all 21 套件 411 项全绿 + 真实 URL 全链路

## 架构决策（先决探测结论）

| 探测 | 结论 | 影响 |
|---|---|---|
| 无 Cookie 请求 /Report/show | HTTP 200，e=9999 完整 67KB JSON | **tid 即能力令牌**，无需任何凭证架构；若未来要登录 → AUTH_REQUIRED 明确报错，绝不绕过 |
| 省略 duration 参数 | 响应逐字节相同 | 不硬编码答题时长，不依赖 duration |
| 三套 ID 空间 | question_list.id ≠ answer.question_id ≠ analysis.id | **题目号（sort/number）是唯一可靠 join key**；证据标记 data-question ↔ analysis.id |

## 数据流

```
报告 URL → parse（host/路径/参数校验）→ fetch（redirect:manual, 20s 超时, 无凭证头）
→ envelope 校验（e=9999, 登录语义→AUTH_REQUIRED）→ adapter（确定性转换, 0 AI）
→ canonical 校验（MISSING_* 检查 + ANSWER_CONFLICT + GRADING_MISMATCH 交叉核对）
→ preview（零写入）→ confirm → ielts_tasks(source=ieltscb) + ielts_attempts
                      + ieltscb_imports（raw 快照注册表）+ Error Bank 路由
→ 现有引擎零改动消费：readiness（taskSkill=reading band 归因）/ /memory / /errors
```

## 复用 vs 新增

**复用（零改动）**：ielts_tasks/ielts_attempts（questions 形状与 234 套阅读题库一致，/ielts 甚至可重练）、readiness 归因、addError 错误银行、/memory 成长分析、tolerant 判分语义（引擎 norm() 同款）。

**新增**：`src/lib/ieltscb/{types,url,client,adapter}.ts`、`src/server/services/ieltscb-import.ts`、`ieltscb_imports` 表、`/api/import/reading/ieltscb/{preview,confirm}`、library Add 标签 IELTSCB 面板（仅 IELTS）、`/ielts/report/[id]` 弱项报告页、`test:ieltscb`（42 项）。

## 关键语义（踩过的坑）

- **text=用户答案，option_names=正确答案**（填空题正确答案为 `/`或`|` 分隔多变体）——answer.list 与 question_list.answer 交叉核对，冲突 → ANSWER_CONFLICT 警告（保留双方）。
- **isright 为官方判分真值**；本地 tolerant 复判不一致 → GRADING_MISMATCH 警告。
- **去重按用户隔离**（套件抓出的真 bug：跨用户撞注册行）：
  - 同 tid（同一报告）→ 仅更新官方资料，**答题历史永不覆盖**；
  - 同篇章新 tid（重测）→ 同一 task 新增 attempt（成长对比的基础）；
  - 新篇章 → 完整导入。
- **band 为单篇估算**：正确率换算到 40 题剑桥 AC 表（2/13 → ≈3），attempt 元数据注明换算依据。
- 核心词 111 个**不进个人词库**（报告页明示"未加入你的个人词库"）；错题同义替换对（farming=agriculture）才进错误银行。
- raw JSON 全量快照存 `ieltscb_imports.raw_snapshot` + sha256 —— 网站字段变了可离线重放 adapter。

## 测试

`npm run test:ieltscb`（fixture 离线确定性 + `IELTSCB_LIVE=1` 真网回环）：42 项——URL 解析 5、信封 3、单测 3、适配器 18（含规范指定 Q1–Q4 语义）、preview/confirm 7、去重三态 2、错误路由 1、readiness 消费 1、LIVE 2。真实 E2E：用户剑8T1P1 报告（2/13, 357s）已导入为 task 1911 / attempt 232，报告页 12/12 HTML 断言通过，错误银行已收录 farming=agriculture 等考点。

## 已知限制

- 仅覆盖 Reading 单项（ Listening/writing 报告待用户提出）；
- 填空题题干标签在网站以图呈现，导入为题组指令 + 题号（诚实处理）；
- 网站改版风险由 raw 快照 + parser_version 兜底（可重放）；
- 浏览器可视化验证缺（本会话浏览器工具异常），面板挂载方式与 FileImport 同构，构建+路由 200 证明。
