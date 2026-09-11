# 放置·修仙之路

基于 **ionet-ts + NestJS** 的官方示例项目。

## 项目说明

- 当前项目名称：放置·修仙之路
- 技术栈：TypeScript、NestJS、ionet-ts、PostgreSQL
- 所有参考项目仅作参考，不作为当前项目业务逻辑指引
- 当前项目是 ionet-ts 官方示例

## 目录结构

```
idle-path-of-xiuxian/
├── packages/server/          # NestJS + ionet-ts Server
├── vendor/ionet-ts/          # 本地 vendor 的 ionet-ts workspace（官方示例依赖）
└── ai-docs/                  # 规划与设计文档
```

## 快速开始

```bash
pnpm install --store-dir /tmp/pnpm-store

# 复制环境变量并配置两个数据库连接串（.env → .env.example）
cp packages/server/.env.example packages/server/.env

# 初始化用户系统表（users / characters）
pnpm --filter idle-path-server db:init

# 初始化 Game 系统表与种子（物品基底/词缀/底材词缀池/拾取规则，P1）
# 用户系统与 Game 游戏系统共用统一库（DATABASE_URL → idle_game）
pnpm --filter idle-path-server db:init:game

# 启动 Server
pnpm --filter idle-path-server dev
```

详细说明见 `packages/server/README.md`。
