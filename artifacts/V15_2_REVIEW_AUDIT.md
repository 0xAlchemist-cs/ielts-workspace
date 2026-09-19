# V15.2 Review Queue Audit — 统一前的重复清单

日期 2026-09-19 · 只读审计

## 现状：两套队列实现

| | `generateReviewQueue` (retention.ts) | `getReviewQueue` (retrieval.ts) |
|---|---|---|
| 定位 | 现代 canonical（复习 API / 模拟 / V15.1 测试在用） | 旧每日队列（mission.ts + smoke/pm 套件在用） |
| 排序 | 6 因子优先级（overdue×35 + failRate×25 + retention×20 + IELTS×10 + crossModule×5 + forgetting×5） | due/new/error 三段拼接（各自 orderBy dueAt） |
| 分类 | 6 类（overdue/weak_retrieval/recurring_error/retention_check/at_risk/new_item） | 无分类 |
| 格式 | decideFormat + antiPatternMode（FORMAT_ROTATION） | decideFormat（有轮换但无反模式） |
| 孤儿处理 | 过取 ×3 跳过补齐（V10 P25） | loadTargets 静默丢弃 |
| 每项理由 | 单 category（if/else 首个命中） | 无 |

**后果**：mission 的复习批次与 /review 页面的队列**排序不一致**（同一天同一用户两套"今天该复习什么"）；旧路径无理由、无孤儿补齐。

## 其余"来源"实为 canonical 队列的分类或自然回流（无需新建）

- **Error Revenge**：已是 recurring_error 分类（error + failCount≥1），无独立引擎 ✓
- **Retention check**：已是 retention_check 分类 + check 调度 ✓
- **Forgetting**：已是 at_risk 分类（detectForgetting）✓
- **Wrong→Practice 失败回流**：submitRetentionReview 重置 SM-2（due=明天）→ 自然回到 almost_due；**缺口：无 wrong_practice 来源标记**
- **Almost due**：1 天宽限已并入 overdue 分类 ✓

## UI 现状

/review 会话已有折叠的 Quick/Standard/Deep（=5/10/20 的尺寸预设，同一队列）✓ 基本合规；**缺口**：开始屏没有来源构成一行（categories 数据已由 API 返回但未展示）。

## 统一方案（V15.2）

1. **删除旧路径**：`getReviewQueue`/`loadTargets`/`buildQueueItem`（retrieval.ts）整体删除；调用方（mission.ts、smoke.ts、verify-pm.ts）改用 `generateReviewQueue`——单一调度、单一优先级、单一格式选择。
2. **reasons[] 多理由合并**：条目仍一项一条，但收集全部命中信号（overdue/weak_retrieval/recurring_error/forgetting/retention_check/almost_due/**wrong_practice**），主 category 保留用于展示兼容。
3. **wrong_practice 来源**：查最近 3 天 wrong_practice_log 的失败记录 → 对应 error 条目打 reason（不建独立队列）。
4. **开始屏来源构成**：一行"3 overdue · 1 recurring error · 1 forgetting"（数据已有，补展示）。
5. **不动**：优先级公式、Review Balance、FORMAT_ROTATION、decideFormat、SM-2、retention 调度、Planner 算法、Memory、Readiness、全部历史表。

## 数据兼容

零 schema 变更；review_history / retention / forgetting / 尝试计数 / 时间戳全部原样（统一只发生在读取层）。reasons 是队列条目上的运行时字段，不落库。
