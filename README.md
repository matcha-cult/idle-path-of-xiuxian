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

# 初始化用户系统数据库
pnpm --filter idle-path-server db:init

# 启动 Server
pnpm --filter idle-path-server dev
```

详细说明见 `packages/server/README.md`。
