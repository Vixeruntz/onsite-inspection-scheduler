# 现场检查调度系统 V1

这是按《产品架构与工程实现说明书》落地的 TypeScript 全栈工程。

## 运行

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run verify:runtime
```

开发模式：

```bash
npm run dev:web
npm run dev:api
```

## Lovable / 云部署说明

这是一个 npm workspaces monorepo：

- Web 应用入口：`apps/web`
- API 逻辑：`apps/api`
- 排期算法与规则引擎：`packages/scheduler`
- 共享业务类型：`packages/domain`

当前线上版本已把核心 API 通过 Next.js Route Handler 内置到 Web 应用里，因此云部署时优先部署 `apps/web` 即可。

推荐构建命令：

```bash
npm install
npm run build --workspace @inspection/web
```

如果平台需要填写输出目录，使用：

```text
apps/web/.next
```

根目录的 `vercel.json` 已包含 Vercel 构建配置，也可作为其他平台识别项目结构的参考。

## Cloudflare 部署说明

当前项目已配置 Cloudflare OpenNext 适配器，可部署为 Cloudflare Worker：

```bash
npm install
npm run cf:build --workspace @inspection/web
npm run cf:deploy --workspace @inspection/web
```

相关配置文件：

- `apps/web/open-next.config.ts`
- `apps/web/wrangler.toml`

注意：普通 `workers.dev` 或 Cloudflare 全球网络部署不等同于中国内地生产可用。若目标用户主要在中国内地，需要使用自有域名，并按 Cloudflare China Network 要求完成 ICP 备案/许可证、域名接入和中国网络开通。未开通 China Network 前，只能作为全球访问或临时演示入口。

生产模式可用 `PORT` 覆盖端口：

```bash
PORT=3001 npm run start:web
PORT=4001 npm run start:api
```

前端默认进入“年度准备中心”：先维护项目、人员、规则三类输入，再生成排期方案。API 与 Prisma schema 已按生产落库形态搭好，后续连接 PostgreSQL 后可切换为真实持久化。

## 输入维护优先流程

- 年度准备：展示项目、人员、规则三项 readiness gate；项目/人员通过、规则存在待补全业务口径时只允许沙盘，正式排期禁用。
- 项目维护：冷启动使用 2026 样表，记录 305 个工作表行、304 条数据行，并生成年度项目池、差异清单和冻结快照。
- 人员维护：按人员版本维护有效期、专项标签、长期归属与 `sampleMaintainers / asset5 / asset7 / all26` 场景。
- 规则维护：复制已发布规则为年度草稿，跑覆盖审计；待补全业务口径继续阻断正式发布，底层仍保留 P1-P7 / `RULE_GAP` 供执行审计。
- 业务规则顺序：规则维护页默认用业务语言展示“是否纳入计划 → 特殊要求 → 风险优先 → 客户类型 → 行业/集团专项 → 敞口分档 → 待明确口径”，并绑定制度依据。

新增准备接口包括：

- `GET /planning-years/2026/readiness`
- `POST /planning-years/2026/projects/import`
- `GET /planning-years/2026/projects/diff`
- `POST /planning-years/2026/projects/freeze`
- `POST /planning-years/2026/people/versions`
- `POST /planning-years/2026/rulesets/copy-from`
- `POST /planning-years/2026/rulesets/{id}/publish`
- `POST /planning-years/2026/runs/generate`
- `GET /rules/business-ordering`
- `GET /rules/evidence-library`
- `GET /rules/{id}/evidence`

## 运行验证

`npm run verify:runtime` 会自动找空闲端口启动 Web/API，检查：

- Web 首页返回 `200 text/html` 并渲染“年度准备中心”
- `/api/export` 返回 Excel 文件
- API `/workspace` 返回项目、人员、任务、审计与年度准备数据
- API `/planning-years/2026/readiness` 返回项目/人员通过、规则阻断的闸门状态
- API `/rules/business-ordering` 返回业务语言规则顺序与制度依据绑定
- 2026 样表可导入并生成审计报告

验证结束后会清理临时子进程，避免遗留卡住的端口。

如果 `localhost:3000` 有旧进程监听但页面无响应，可先查看并清理：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
```

## 样表说明

`1、2026（资产部）授信检查计划（样表）.xlsx` 的工作表显示 305 行，其中第 1 行是表头；当前导入器读取到 304 条数据行。说明书中“305 行”按工作表总行数表述。

## 目录

- `apps/web`：Next.js 调度工作台
- `apps/api`：NestJS REST API
- `packages/domain`：共享类型、枚举、Zod schema
- `packages/scheduler`：规则引擎、五步管道、审计、diff、导入导出
- `prisma/schema.prisma`：PostgreSQL 数据模型与 append-only 约束迁移说明
