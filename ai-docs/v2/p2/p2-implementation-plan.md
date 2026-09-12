# P2 实施计划 — 功法体系（结构层）

> 依据：`../xiuxian-design-v2.md` §6、`p2-clarification-checklist.md`（全部 ★ 已确认）
> 配套：`p2-seed-spec.md`、`p2-api-contract.md`

---

## 1. 范围（★ 决策固化）

| 项 | 结论 |
| --- | --- |
| 境界突破 | 不含（另排 P2.5+）；P2 仅功法结构层 |
| 灵韵来源 | 开发接口注入（lingyun/grant，dev 门禁同 generate） |
| 功法效果 | 只落库 + 渲染，不参与属性计算（P4 接入） |
| 阵容 | 4 心法 + 5 术法（9 部种子，标签覆盖 剑/雷/火/冰/体；阵/丹/符 预留） |
| 协同 | 主心法道基一致的术法，展示「协同 +20%」（配置 synergyBonusPct） |
| 升级 | 每级效果 ×(1+5%×(LV−1))；参悟消耗=100×当前等级；上限 20 级 |
| 神识 | 预算 100（config），辅心法四档 10/20/40/80；主心法不计预算 |
| 换装 | P2 免费随时换 |
| 载体 | 独立三表 game_skills / game_learned_skills / game_skill_panels；slots 存 JSON 字符串 |
| 玉简 | characters 表加 jade_slips 计数列（P2 占位；P4 物品化）；learn 消耗 1 枚；jade-grant 发放 |

---

## 2. 数据模型

### 2.1 game_skills（功法定义）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | SERIAL PK | |
| code | VARCHAR(50) UNIQUE | xinfa_qingyun / shufa_jianqi |
| name | VARCHAR(50) | 青云心法 |
| skill_type | VARCHAR(10) | xinfa / shufa |
| daoji | VARCHAR(20) | 剑/雷/火/冰/体/阵/丹/符（心法恒有，术法可有） |
| school | VARCHAR(10) | wai=外功 / nei=内功（心法恒 nei；术法按其性质） |
| spirit_cost | SMALLINT | 仅心法（10/20/40/80）；术法=0 |
| effects | TEXT | JSON 字符串：1 级效果 {"atk_pct":4} / {"skill_damage":100} |
| growth_rate | DOUBLE PRECISION | 默认 0.05（每级 +5%） |
| description | VARCHAR(255) | 文案 |
| created_at / updated_at | TIMESTAMP(6) | |

### 2.2 game_learned_skills（已修习：永久不可遗忘）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | SERIAL PK | |
| character_id | INT | |
| skill_id | INT | → game_skills.id |
| level | INT default 1 | 参悟等级 1~20 |
| learned_at | TIMESTAMP(6) | |
| UNIQUE(character_id, skill_id) + index(character_id) | | 修习幂等 |

### 2.3 game_skill_panels（9 槽：4 心法 1 主 3 辅 + 5 术法）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | SERIAL PK | |
| character_id | INT UNIQUE | |
| slots | TEXT | JSON 字符串 {"xinfa":{"main":code|null,"aux":[code...]},"shufa":[code...]} |
| updated_at | TIMESTAMP(6) | |

### 2.4 characters 扩展

- `jade_slips BIGINT NOT NULL DEFAULT 0`（未开光玉简计数；P2 占位，P4 物品化）
- `lingyun`（已建，P1）。

### 2.5 配置扩展（config/app.config.json）

- `spiritBudget: 100`；`maxSkillLevel: 20`；`enlightenBaseCost: 100`；`synergyBonusPct: 20`；`devToolRateLimitPerMinute: 5`（generate/lingyun-grant/jade-grant 共用限流额度）。

---

## 3. 实施步骤

| 步 | 产出 | 依赖 |
| --- | --- | --- |
| 1 | 配置扩展（4 键）+ app-config.ts 类型 | — |
| 2 | characters.jade_slips：schema.prisma + init-db.mjs ALTER + CharacterService | — |
| 3 | game 库三表 DDL（init-game-db.mjs）+ schema.prisma 模型 | 1 |
| 4 | seeds/game/skills.json（9 部，显式 id 1~9）+ 重灌逻辑 | 3 |
| 5 | skill 域类型 + SkillService（learn/enlighten/panel/图鉴/校验/渲染） | 3、4 |
| 6 | SkillController（7 路由，含 2 个 dev 门禁接口）+ module 接线 | 5 |
| 7 | typecheck/build → db:init → db:init:game → 重启冒烟 | 全部 |

---

## 4. 核心校验规则

- **learn**：角色存在；skill 存在；未修习（UNIQUE∩幂等返回）；jade_slips ≥ 1；成功后 jade−1 + 入册（事务）。
- **panel PUT**：主/辅/术法 code 合法且已修习；槽内不重复；辅心法 ≤3；术法 ≤5；主心法可空（未定流派）；sum(辅 spirit_cost) ≤ spiritBudget。
- **enlighten**：已修习；level < maxSkillLevel；消耗 = enlightenBaseCost × level；lingyun 足够（事务扣减，BIGINT 用字符串运算避免精度损失）。
- **渲染**：等级效果 = base × (1 + growth_rate × (level−1))；面板视图附主心法流派与各术法协同标记（+20% 占位文案）。
- **dev 门禁（grant 类）**：NODE_ENV=production 拒绝；单账户共用限流（devToolRateLimitPerMinute 次/分）。

---

## 5. 验证清单

- [ ] 建库后 9 部功法、3 表就位；重灌不破坏 learned/panels（仅重灌 skills 定义，显式 id）
- [ ] learn 全生命周期：grant → learn（玉简−1）→ 重复 learn 幂等 → jade 不足报错
- [ ] panel 装配：装 1 主 3 辅 5 术法；神识超预算拒绝；未修习拒绝；槽内重复拒绝；免费换装
- [ ] enlighten：1→2 耗 100；到 20 级封顶；灵韵不足拒绝
- [ ] 图鉴：修习状态与等级正确；面板显示协同标记
- [ ] dev 门禁：production 拒绝、限流第 6 次拒绝
- [ ] typecheck/build 零错误；/api/health 回归 200
