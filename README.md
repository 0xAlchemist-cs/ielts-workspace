# IELTS Active Learning Workspace

本地优先的个人雅思训练系统 —— 不是刷题 App，不是背单词软件。

**学习闭环**：`输入 → 理解 → 注意 → 深加工 → 提取 → 输出 → 反馈 → 再利用`

每个功能只为一个目标服务：把「我认识这些词」变成「我能用英语思考和表达」——直接建立 **概念 → 英语** 的连接。所有进度都建立在真实证据上，从不显示"你学了 N 个单词"这种幻觉数字。

> 当前状态：**v1-corpus-complete**（语料完成态里程碑 tag）。14 个学习引擎 + 全真模考 + 完整语料库 + 每日异地备份，无已知未缓解风险。

---

## 快速开始

```bash
npm ci

# 一次性下载词典语料（约 68MB）
curl -L -o data/ecdict.csv   https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o data/lemma.en.txt https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt

# 建表 + 种子语料 + 词典导入
npm run db:push
npm run db:seed
npm run db:dict

npm run dev        # 开发模式
npm run start      # 生产模式（自动绑定 127.0.0.1:3000）
```

首次访问进入 onboarding（自评基线 → 弱点 → 沉浸等级），之后首页每天自动生成 Today's Mission。

**注意**：`public/audio/`（约 1.1GB 剑桥音频）不入 git——新机器克隆后需重新获取（来源见语料章节）；嫌慢可直接从 OneDrive 备份目录拷贝。

## AI 配置（可选但推荐）

不配置也能完整使用：内置确定性 **Mock Provider**（所有 AI 输出会标注 ⚙︎ Mock）。配置后全站升级为真 LLM（句子 8 维分析、考官级作文批改、AI 判分、平行操练生成…）：

- **推荐**：应用内 `Settings → AI Provider` 直接填 baseURL / apiKey / 模型（存 `app_config` 表，即时生效，支持连接测试）
- 或 `.env.local`：`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`（兼容任何 OpenAI 协议端点：GLM / OpenAI / DeepSeek…）

Live 调用失败（网络/限额/超时）会静默降级到 Mock 并标注——学习流程永不中断。注意按任务分级的超时：句子 150s / 写作 180s / 口语 90s。

## 功能地图

| 模块 | 路由 | 训练什么 |
| --- | --- | --- |
| Today's Mission | `/` | 每日编排：焦点诊断 → 七步任务 → **今日证据清单**（What changed today）；⚡Lite 三步精简模式 |
| Input Library | `/library` | 650+ 篇分级素材（12 个雅思话题），粘贴即分析的 Add Content |
| Active Reading | `/read/[id]` | **先猜后揭晓**的词卡、划句 8 维深析、语块提取；文章常驻左栏的四阶段精读工作台 |
| Listening Lab | `/listen/[id]` | 盲听 → 漏听标记 → 听写填空 → 转写连读标注 → 跟读评分（真实剑桥音频 + AudioController 段级控制） |
| Writing Lab | `/writing` | 六阶段真实写作环境：审题 → 构思 → 写作（**提交瞬间本地秒评** + AI 深评）→ 反馈 → 重写对照 → 迁移 |
| Speaking | `/speaking` + `/external` | 已外包给用户自选的 ChatGPT GPT 教练（External Hub 记录学习数据） |
| **全真模考** | `/ielts/mock` | **听力(4 段只播一次) + 阅读(3 篇) + 写作，150 分钟一坐**；每日随机换卷（60 套完整剑桥卷）；刷新续考、超时自动交卷、服务端判分防作弊、四科 band 报告 + 逐题复盘 |
| IELTS Engine | `/ielts` | 单题 Learning/Exam 模式、自适应选题、策略错误 vs 语言错误分离 |
| Retrieval | `/review` | 中文提示 → 凭记忆产出英语（SM-2 变体 + 保留度引擎，production 加权） |
| Error Bank | `/errors` | 每条 AI 纠错自动入库（只收真错误：error/ambiguity/register/style 四分法）；**平行操练**——同一错误模式换三个新场景再测，直到杀死 |
| Chunk Bank | `/chunks` | 语块为学习单元；搭配/近义/对比词汇网络 |
| Learning Profile | `/profile` | 能力画像 + 轨迹趋势 + 五级真实漏斗 |

**双语系统**：顶栏 中英（全中文辅助）/ 沉浸（纯英文环境）一键切换；暗色模式。

## 反幻觉原则

首页永远不显示"学了 N 个词"，只有真实漏斗：

**Exposed → Understood → Retrieved → Used → Retained**

只有闭卷产出英语才能推动漏斗下层。强度来自提取和使用，从不来自重读。

## 语料库（v1-corpus-complete）

| 语料 | 规模 | 来源 |
| --- | --- | --- |
| 剑桥听力题库 | **249 节 / 2267 题**（c5–c20，带音频对齐+转写验证） | ielts-reader 对齐数据 + 官方题页交叉验证 |
| 全真模考卷 | **60 套**完整 4-part 听力卷 | 上述题库组卷 |
| 剑桥阅读题库 | 234 套 / 3147 题（带答案+中文解析） | ielts-practice |
| 写作题库 | Task 1 **315** · Task 2 **259**（剑桥真题 + 预测 + Anna） | 多源采集去重 |
| 双语范文 | 37 篇（Anna 9–12 月，带中文翻译） | 文本层直读，零 OCR |
| 学习内容 | 657 篇 contents（12 话题分类） | 剑桥转写 + Simon 教辅 + 主题素材 |
| 词汇语料 | 8413 词（79% 带例句，45% 带音频） | ECDICT + 词汇真经 + 真题语料 |
| 语法结构库 | 23 组对比结构（写作句式 + 意义层语法） | 教辅解析 + up-guide 语法篇 |

全部导入器幂等（复跑零插入），见 `package.json` 的 `db:*` 脚本。版权口径：剑桥真题等第三方材料仅限**个人本地使用**，勿再分发。

## 测试与门禁

```bash
npm run verify:all     # lint + tsc --noEmit + 七套件，全绿才过
```

套件：smoke 25（学习闭环端到端）· pm 27 · engine 18 · rotation 9 · loop 25（7 天循环审计）· writing-gate · input-gates。全部自清理。`.githooks/pre-push` 已挂钩（`--no-verify` 可跳过）。`verify-security` 按需手动跑（会调用真实已存端点）。

## 安全模型（单机基线）

- **仅本机访问**：`npm run start` 绑定 `127.0.0.1`——单用户无鉴权，不暴露局域网是设计决定（如需手机访问请自行改绑定并自担风险）
- SSRF 防护：所有用户提供的 URL 过 `url-guard`（拒环回/内网/元数据地址 + DNS 解析核验），AI 请求 `redirect: manual`
- 已存 API key 只发往已存端点；全 POST 路由带输入长度闸门与类型校验
- 安全响应头（CSP/XFO/nosniff 等）见 `next.config.ts`

## 备份（每日自动，异地云层）

- Windows 计划任务 **IELTS Workspace Backup**，每日 09:30（pythonw 无窗口）
- 双轨：git bundle 全量历史（3 份轮转）+ `app.db` VACUUM INTO 一致性快照（14 天轮转，WAL 下运行中安全）
- 目的地：`C:\Users\Lenovo\OneDrive\IELTS-Workspace-Backup\`——OneDrive 提供真正的异地层

## 数据

- 一切数据在 `data/app.db`（SQLite, WAL）；删除即重置
- 导出：`GET /api/export` 全量学习数据 JSON
- 学习上下文（今日为证）：激活表达、提取答对、复仇错误等均可在首页证据清单与 Profile 查证

## 技术栈

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Drizzle ORM + better-sqlite3 · zod · Web Speech API + MediaRecorder · Apple 风格设计系统（Lucide 图标、双语沉浸、暗色令牌、Emil Kowalski 动效原则）
