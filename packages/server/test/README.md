# 单元测试约定（packages/server/test）

## 运行

```bash
pnpm --filter idle-path-server test:unit        # tsx --test "test/**/*.test.ts"
pnpm --filter idle-path-server typecheck:test   # 测试代码类型检查
pnpm --filter idle-path-server verify           # typecheck + typecheck:test + check:deps + test:unit
```

运行器是 Node 内置 `node:test`（经 `tsx` 执行 TS），**不引入新依赖**。

## 硬性约定

1. **绝不使用 NestJS 容器**。`tsx` 底层是 esbuild，不产出 `design:paramtypes`，
   按类型注入会静默得到 `undefined`（本项目曾因此全 HTTP 500）。
   一律 `new SomeService(fakeDep1, fakeDep2)` 手动构造。
2. **导入路径带 `.js` 后缀**（NodeNext），例如 `import { X } from '../../src/modules/.../x.service.js'`。
3. **不修改 `test/helpers/*`**（多人并行编写，改了会互相影响）。需要新桩请在提交说明里提出。
4. 每个用例必须覆盖**边界**，不只是 happy path。边界清单见下。

## 助手

| 助手 | 用途 |
|---|---|
| `FakeDatabase`（helpers/fake-db.ts） | 假 DB：`fake.on(/SQL/, { rows })` 按正则分发；`fake.calls`/`lastCall(re)` 断言 SQL 与参数；支持 `Promise` 与挂起（超时分支） |
| `flowContext` / `authedContext`（helpers/flow.ts） | **真实** `FlowContext`（无容器），可设 userId/cmd/subCmd/data |
| `FakeRedis`（helpers/fake-redis.ts） | `mode = 'pong' \| 'wrong' \| 'throw' \| 'hang'` |
| `stub`（helpers/stub.ts） | 记录调用的桩：`stub((...a) => value)`，`stub.calls` / `callCount` / `last` |
| `FakeWebSocket`（helpers/fake-ws.ts） | 手动触发 open/message/close/error，用于 ws-client |

服务只依赖 `query(sql, params)`，因此 `new Service(fake as never)` 即可注入。

## 边界清单（每个模块都要过一遍）

- **数值**：下界−1 / 下界 / 上界 / 上界+1 / 0 / 负数 / 小数 / `NaN` / `Infinity` / `Number.MAX_SAFE_INTEGER`
- **字符串**：空串 / 纯空白 / 超长（上界、上界+1）/ 大小写 / 前后空白 / 非法字符
- **可选缺失**：`undefined` / `null` / 类型不符（数字给字符串、对象给数组等）
- **集合**：空集 / 单元素 / 重复元素 / 越界索引
- **鉴权**：未鉴权（userId=0n）/ 合法 token / 非法 token / 缺失 token
- **分支**：SQL 无行 / 单行 / 多行；DB 抛错 / 超时
- **幂等与上限**：重复调用、达到上限、超过上限

## 反模式

- ❌ 只测 happy path（"调用成功"）
- ❌ 断言实现细节（除非该细节就是契约，如 SQL 参数）
- ❌ 依赖真实 DB / Redis / 网络（集成测试放在 `scripts/e2e-*.mts`）
- ❌ 测试之间共享可变状态（APP_CONFIG 等全局需在 `finally` 里还原）

## 目录

```
test/
  helpers/            共享桩（勿改）
  ionet/              Action 支持、cmd、鉴权 InOut
  common/             kernel、限流、配置
  logic/              11 个逻辑服 Action 的参数与鉴权边界
  modules/            auth / character / health / edge / game 各服务
  sdk/                ws-client
```
