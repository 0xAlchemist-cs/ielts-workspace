# 产品重构方案（v2 定稿，依据 ROLE.md spec）

> 本文件是重构的唯一权威进度锚点。跨会话续作时先读此文件。
> 红线：不破坏任何已工作的引擎（见 spec "DO NOT BREAK THESE"）；数据不动；
> 每阶段完成即打勾并跑 verify 相关子集，全部完成后跑 verify:all + build + E2E。

## 定稿决策

**定位（10 秒可解释）**：
> The IELTS system that remembers what you actually know.
> 记录你真正掌握什么的雅思学习系统。

**核心循环（用户语言）**：Learn → Retrieve → Use → Retain（环境只是循环的通道）

**最强差异化 ×3**：① 个人学习记忆（错误/失败/遗忘都被记住并驱动下一步）
② 证据漏斗（见过≠会检索≠会用≠会迁移≠已保留）③ 真实剑桥语料全真测量

**语言模式**：保持现有二态 中英/沉浸（已符合 spec 的两态要求，不再简化）

## 信息架构（定稿导航）

- **TODAY 今日**：Today(/)（原 Mission）
- **PRACTICE 练习**：Reading(/library) · Listening(/library?tab=listen 或 type 筛选) · Writing(/writing) · Speaking(/external 外部教练) · IELTS Practice(/ielts 原"雅思引擎") · Mock Exam(/ielts/mock)
- **STUDY 学习**：Review(/review) · Errors(/errors) · Language(/chunks) · Lab(/lab)
- **PROGRESS 进步**：My Progress(/profile 单入口，轨迹为其内部分区)
- 底部：Settings
- 移除：引擎术语（雅思引擎→IELTS Practice）、Profile/Progress 双入口、独立 Coach 组

## 页面级改造（按 spec Phase 3-14）

| Phase | 页面 | 改造要点 | 状态 |
|---|---|---|---|
| D | 侧栏导航 | 上表重分组+改名；补听力入口 | ✅ 已验（nav+引擎术语清零）|
| E | 首页 | 三问结构+Why3+What will change+Recent change | ✅ 已验 |
| F | 证据呈现 | 漏斗五级可视化组件（Exposed→…→Retained）首页+Profile 复用 | ✅ 首页已上（EvidenceFunnel）；Profile 复用待 I |
| G | Error Bank | 从表格→"你的惯犯错误"卡片：发生次数/模式/状态(UNSTABLE)/平行操练为主 CTA | ✅ 已验 |
| G2 | Review | 保持先想后揭晓；去卡片化装饰 | ☐（现状已接近，微调） |
| H | Reading/Listening/Writing | 已达标（近两轮重构完成）；Writing 检查 TASK→PLAN→WRITE 流 | ☐ 核对 |
| I | Profile | 语句化结论优先（"词汇认读强，即兴提取弱"），数字只作佐证；Mock 报告→下一步学习建议 | ◐ Mock→下一步已上；Profile 语句化待做 |
| J | 语言模式 | 二态已合规；全站审计一遍泄漏 | ☐ |
| K | 暗色/亮色 | 已有令牌体系；抽查 | ☐ |
| L | 响应式 1024-1920 | 抽查 | ☐ |
| M | README 重写 | 按产品叙事顺序（定位→问题→理念→差异→一天→环境→证据→测量→技术） | ✅ |
| N | 全量回归 | verify:all + build + 浏览器 E2E 主路由 | ✅ verify:all 绿（F/G/I 批） |

## 微术语替换表（用户界面）

| 旧 | 新 |
|---|---|
| Mission / 今日任务 | Today / 今日 |
| IELTS 引擎 | IELTS Practice / 雅思练习 |
| 错误银行（界面标题） | Your Recurring Mistakes / 惯犯错误 |
| Learning Profile（界面） | My Progress / 我的进步 |
| 素材库 | Library / 素材库（保持） |

引擎名（Priority/Retrieval/Rotation/Retention Engine）只存在于代码与 docs，永不出现在 UI。
