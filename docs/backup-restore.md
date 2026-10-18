# 备份与恢复（灾备记录）

## 备份机制

`scripts/backup-workspace.py`（Windows 任务计划每日运行，也可手动执行）：

1. `git bundle --all` → `~/OneDrive/IELTS-Workspace-Backup/repo/ielts-workspace-YYYYMMDD.bundle`（保留 3 份）
2. `app.db` 经 **`VACUUM INTO`** 一致性快照（WAL 安全，运行中亦可）→ `~/OneDrive/IELTS-Workspace-Backup/db/app-db-YYYYMMDD.sqlite`（保留 14 份）

文件名格式为 `app-db-年月日`（如 `app-db-20261018.sqlite`）。

## 已验证的恢复演练（2026-10-18）

在隔离目录用 **标签 `v16.0-audit-closed` 的代码** + 当日快照完成全链路演练：

| 步骤 | 结果 |
|---|---|
| 快照拷入为 `data/app.db`，integrity_check | ok |
| `next build`（对恢复库构建） | 成功，24/24 页面 |
| `next start -H 127.0.0.1`（隔离端口） | 启动 |
| `/`、`/library`、`/review`、`/chunks`、`/api/export` | 全部 200，导出返回真实用户数据 |
| 生产库前后哈希比对 | **分毫未动** |

## 环境限制（重要）

本次演练验证的是**当前 Windows 机器上的恢复能力**，不是全新机器的独立恢复。
演练中 `npm ci` 因 node-gyp 原生编译失败（better-sqlite3），最终复用了主仓库已构建的
`node_modules`（注意：目录联接/junction 会被 Turbopack 拒绝，必须是真实文件）。

跨机器恢复前需确保：

- **Node.js 版本一致**（当前 v22；better-sqlite3 的原生绑定与 Node 大版本绑定）
- **可用依赖**：要么提前备好与代码版本匹配、已在本机构建好的 `node_modules`，
  要么机器上有完整的原生构建工具链（Windows: VS Build Tools + Python）供 `npm ci` 编译
- 恢复时代码取自 git（仓库或 bundle），数据库取自快照，两者版本需对应
  （本次对应关系：快照 20261018 ↔ `v16.0-audit-closed`/`7f0faf5` 之后的 schema）

## 恢复步骤（照做清单）

1. `git clone`（或从 bundle 解出）目标版本，切到对应标签
2. 依赖落位（见上文环境限制）
3. 拷贝快照：`cp ~/OneDrive/IELTS-Workspace-Backup/db/app-db-YYYYMMDD.sqlite data/app.db`
4. `npm run build` && `npm start`（已绑定 127.0.0.1）
5. 验证：首页/导出接口返回真实数据
6. 切忌直接覆盖正在使用的 `data/app.db`——先停服务、留旧库，再替换
