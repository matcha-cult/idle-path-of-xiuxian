# 放置·修仙之路 — 用户系统 Server 模块规划

> 文档状态：待审批
> 工作区：`<workspace>`

## 1. 项目定位

- 当前项目名称：**放置·修仙之路**
- 技术架构：**ionet-ts + NestJS**
  - ionet-ts 是基于 TypeScript 参照 Java 网络框架实现的服务端框架。
  - 当前项目同时作为 **ionet-ts 的官方示例项目** 对外展示。
- 所有参考项目（含已终止开发的废案）**仅作参考**，不构成当前项目业务逻辑的指引。

## 2. 目标

在现有 `packages/server` 中新增一个 **用户系统 Server 模块**，范围仅限：

- 用户系统：注册、登录、JWT 认证
- 角色系统：角色检查、角色创建、角色信息

不迁移参考项目中的股市、AI、调度器、库存等其它业务。

## 3. 参考项目关系说明

以下项目全部**仅作参考**，不作为当前项目业务逻辑的指引：

| 项目路径 | 性质 |
| --- | --- |
| `<local-project>/stock-sim` | 已上线运营项目 |
| `<local-project>/idle-matcha` | 已上线项目的改进版，但因故终止开发（废案） |
| `<local-project>/idle-jiuzhou` | 开源项目 |
| `<local-project>/idle-jiuzhou/stock-market-service` | 参考实现的废案项目 |

约束：

- 不直接复制任何参考项目的业务逻辑到当前项目。
- 如有冲突，以当前项目「放置·修仙之路」的架构和业务设计为准。
- 当前项目是 **ionet-ts 官方示例项目**，技术形态以 ionet-ts + NestJS 为准。

## 4. 兼容性警告

需要明确标注：**参考废案之间、以及参考废案与当前新项目规划中的角色系统均不兼容**。

尤其注意：

- `<local-project>/idle-matcha` 是 stock-sim 的改进版，角色系统已扩展（如 `permissions`、`title`、月卡、流水、灵田、灵兽、锁妖窟等关联）。
- `<local-project>/idle-jiuzhou/stock-market-service` 是精简参考实现，角色系统只有基础字段，默认灵石 0。
- 因此不能把 `idle-matcha` 的角色表结构与 `stock-market-service` 的角色表结构混为一谈。
- 当前新项目使用**新建数据库**，不继承任何参考项目/废案的数据库结构。

| 对比项 | stock-market-service（精简废案） | idle-matcha（改进版废案） |
| --- | --- | --- |
| `users` | username/password 等基础字段 | 已有 `permissions` 等扩展字段 |
| `characters` | 精简字段，默认灵石 0 | 已有 `title`，默认灵石 10000，关联大量业务表 |
| 角色关联 | 仅股市相关 | 月卡、流水、灵田、灵兽、锁妖窟等 |
| 架构 | Express 单服务 | NestJS + ionet-ts 双通道 |

因此：

1. 不直接覆盖或合并任何参考项目的 `users` / `characters` 表。
2. 新建独立数据库，独立承载当前项目的用户系统模块。
3. 参考时需先说明来自哪个参考项目，并标注其是否为废案。

## 5. 目标形态

- **目标形态：B**
  - 在现有 `packages/server` 中新增独立模块，而不是新建独立服务包。
- 模块建议位置：
  - `packages/server/src/modules/user/`（可按实际结构调整）
  - 或沿用当前 `domains/auth`、`domains/character` 的领域组织方式，但明确标注为“用户系统模块”独立边界。

## 6. 数据库

- **新建数据库**，与现有业务数据库隔离。
- 数据库连接通过独立环境变量配置，例如：
  - `USER_SERVICE_DATABASE_URL`
  - 不依赖/不修改当前 `DATABASE_URL`
- 表结构仅包含用户系统所需：
  - `users`
  - `characters`
- 表结构设计以当前项目规范为准，仅参考废案字段。

## 7. 接口形式

接口分为两部分：

### 7.1 HTTP 部分

- **完全采用 NestJS 风格**
- 使用标准 REST 路由：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/character/check`
  - `POST /api/character/create`
  - `GET /api/character/info`
- 使用 NestJS Controller、Guard、Pipe、Module。

### 7.2 ionet-ts / WS 部分

- **ionet-ts 侧 WS 接口禁止调整**
- 不在 ionet-ts 侧新增或修改业务 Action。
- 仅允许 NestJS 侧预留一个路径作为 **WS 连接入口**。
- WS 入口只负责连接接入/握手，不承载用户系统业务逻辑。

## 8. 实施步骤

### 8.1 确认与准备
- [ ] 确认新建数据库名称与连接配置。
- [ ] 确认模块目录结构。
- [ ] 梳理参考项目用户/角色相关代码，仅作参考。

### 8.2 数据库层
- [ ] 新建独立数据库。
- [ ] 创建独立 Prisma Schema 或独立连接配置。
- [ ] 仅迁移/设计 `users` 和 `characters` 表。

### 8.3 服务层
- [ ] 实现用户注册、登录、JWT 签发/校验。
- [ ] 实现角色检查、创建、信息查询。
- [ ] 不引入废案其它业务逻辑。

### 8.4 HTTP 层（NestJS）
- [ ] 实现 Auth Controller。
- [ ] 实现 Character Controller。
- [ ] 实现 JWT Guard。

### 8.5 WS 入口（NestJS 预留）
- [ ] 仅预留一个 WS 路径作为连接入口。
- [ ] 不调整 ionet-ts 侧 WS 接口。

### 8.6 文档与标注
- [ ] 在模块 README/注释中标注：
  - 参考项目关系：stock-sim 已上线、idle-matcha 为改进版废案、idle-jiuzhou 为开源项目、stock-market-service 为参考实现废案。
  - 当前新项目角色系统与参考废案不兼容，禁止直接合并表结构。
  - 当前项目是 ionet-ts 官方示例。

### 8.7 验证
- [ ] TypeScript 类型检查通过。
- [ ] `packages/server` 构建通过。
- [ ] 用户注册/登录/角色接口可用。
- [ ] WS 入口可连接且不影响 ionet-ts 原有 WS。

## 9. 非目标

- 不迁移股市系统。
- 不迁移 AI 新闻/事件系统。
- 不迁移调度器、Worker。
- 不迁移库存、月卡、灵田、灵兽、锁妖窟等业务。
- 不调整现有 ionet-ts WS 协议。

## 10. 待审批项

1. 新建数据库名称、连接串格式。
2. 模块在 `packages/server` 中的具体目录。
3. WS 预留路径的具体值（如 `/ws-user`）。
4. 是否需要独立 Prisma schema 文件，还是独立数据库 + 独立 service 连接。
