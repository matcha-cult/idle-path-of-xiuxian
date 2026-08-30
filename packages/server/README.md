# idle-path-server

放置·修仙之路后端 Server。

## 技术栈

- NestJS（HTTP API 全部 NestJS 风格）
- ionet-ts（官方示例集成，仅注册 HealthAction，不启用 ionet-ts HTTP/WS 外部服务）
- PostgreSQL（用户系统独立新建数据库）

## 快速开始

```bash
# 安装依赖（仓库根目录）
pnpm install --store-dir /tmp/pnpm-store

# 初始化数据库（需先创建数据库并配置 USER_SERVICE_DATABASE_URL）
pnpm --filter idle-path-server db:init

# 开发
pnpm --filter idle-path-server dev

# 构建
pnpm --filter idle-path-server build

# 类型检查
pnpm --filter idle-path-server typecheck
```

## HTTP 接口

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | /api/auth/register | 注册 | 公开 |
| POST | /api/auth/login | 登录 | 公开 |
| GET | /api/character/check | 检查角色 | JWT |
| POST | /api/character/create | 创建角色 | JWT |
| GET | /api/character/info | 获取角色信息 | JWT |

## WS 入口

- 路径：`/ws-user`
- 由 NestJS 侧预留，仅做连接接入/握手。
- ionet-ts 侧 WS 接口不调整。

## 参考项目说明

- 所有参考项目仅作参考，不作为当前项目业务逻辑指引。
- `idle-matcha` 为已上线项目改进版，已终止开发（废案）。
- `stock-market-service` 为参考实现废案。
- 当前项目使用新建数据库，不继承任何参考项目/废案数据库。
