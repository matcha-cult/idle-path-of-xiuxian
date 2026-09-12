# 构建取源与完整性校验方案

> **目标**：保证「构建机从 GitHub 下载到的代码」是**正确、完整、可追溯**的。
> **范围**：只覆盖 **取源 → 校验 → 打包**。部署机侧的编译/部署沿用你现有流程，不在本文范围。
> **产物**：`fetch-source.sh`（构建机取源入口）、`verify-source.sh`（校验器，源码树/构建包双模式）。

---

## 0. 结论速览

1. **子模块这一环今天是通的**：框架仓库 `dev` 与 `origin/dev` 完全同步（0 个未推送提交），父仓库 pin 的 `62ab3f2` 确实存在于 GitHub。
2. **父仓库地址按 `git@github.com:matcha-cult/idle-path-of-xiuxian.git` 假定存在**（与框架同属 `matcha-cult` org）。脚本只接受「远程分支名」入参，仓库一旦可达即可直接工作。
3. fresh-clone 模型下，危险的**不是**"取不到"（那会响亮失败），而是三种**静默**错误：本地未推送代码混入、子模块漂移到 dev 尖端、`git archive` 打出空 vendor 的包。
4. 方案是**三道闸门**：① 只能基于远程分支尖端构建 → ② 递归取子模块并断言指针一致 → ③ 校验**打包产物本身**而非工作树。
5. 每份构建包带 `manifest.json`（父 SHA + 子模块 SHA + 内容哈希）。你的 CI 保留最近 10 次构建包，这 10 份因此变得**可自证、可对账、可回滚**。

---

## 1. 现状核查（实测）

| 检查项 | 结果 |
|---|---|
| 框架仓库 remote | `git@github.com:matcha-cult/ionet-ts.git` |
| 框架 `dev` vs `origin/dev` | ✅ 同步，`rev-list --count origin/dev..dev` = **0** |
| 父仓库 pin 的子模块 SHA | `62ab3f2138dbc81be38ee4747362336fac089390` |
| 该 SHA 是否可达 GitHub | ✅ `git merge-base --is-ancestor 62ab3f2 origin/dev` 通过 |
| 父仓库 GitHub 地址 | 按 `git@github.com:matcha-cult/idle-path-of-xiuxian.git` **假定存在**（本地尚未配置 remote） |
| 父仓库未提交改动 | ⚠️ 4 个文件（`ai-docs/frontend-solution-exploration/`）—— 构建取的是**已推送**提交，这些不会进包 |
| `.gitmodules` URL 协议 | **SSH**（`git@github.com:...`） |

### 前置假设

```
父仓库:  git@github.com:matcha-cult/idle-path-of-xiuxian.git   分支 master
框架仓库: git@github.com:matcha-cult/ionet-ts.git              子模块，pin 由父仓库决定
```

构建机只需对这两个仓库有**读权限**。注意构建取的是**已推送的提交**——本地未提交/未推送的改动不会进包，这正是下面失效点 #1 的来源。

---

## 2. 为什么 fresh-clone 模型下风险点变了

你原以为的风险是「GitHub 上取不到子模块」。但你的构建机是**每次全新下载**，持久目录型 CI 的"子模块不更新"问题不存在——取而代之的是下面这组。**注意最后一列的"是否报错"，真正的敌人全是静默的那几个。**

| # | 失效点 | 触发条件 | 后果 | 报错？ |
|---|---|---|---|---|
| 1 | **本地未推送代码** | 构建机取的是 GitHub 的提交，你本地还有未 commit/push 的改动 | 本地测过的 ≠ 构建机拿到的 | ❌ **静默** |
| 2 | **`git archive` 丢子模块** | 用 `git archive` / `git bundle` 打包 | 包内 `vendor/ionet-ts` 为**空** | ❌ **静默** |
| 3 | **子模块漂移到 dev 尖端** | 用了 `git submodule update --remote`（`.gitmodules` 里恰好写了 `branch = dev`） | 同一父 commit 在不同时间构建出**不同**框架代码 | ❌ **静默** |
| 4 | **浅克隆取不到 pin** | `--depth 1` / `--shallow-submodules`，而 pin 的提交不是分支尖端 | `submodule update` 失败 | ✅ 响亮 |
| 5 | **子模块 SHA 不在 GitHub** | 框架侧提交了但没 push | clone 阶段失败 | ✅ 响亮 |
| 6 | **忘了 `--recursive`** | clone 未带 `--recurse-submodules` | 目录为空 → `pnpm install` 找不到 workspace 包 | ✅ 响亮 |
| 7 | **构建包校验的是工作树不是包** | 打包命令写错，但工作树是对的 | 包有问题却检查不出来 | ❌ **静默** |

> 第 3 条特别值得强调：`.gitmodules` 里 `branch = dev` 这个字段**只对 `--remote` 生效**，`git submodule update --init` 不受影响。它是"子模块意图跟踪 dev"的声明，不是"每次构建取 dev 最新"的授权。构建必须锁定父仓库记录的 gitlink。

---

## 3. 方案总览

```
构建请求(branch)
      │
      ▼
① 全新 clone + checkout --detach origin/<branch>
      │      └─ 结构性保证：HEAD 必然是远程可达提交，闸门①消灭失效点 1
      ▼
② git submodule sync + update --init --recursive
      │      └─ 闸门②：断言 submodule HEAD == 父仓库 gitlink，消灭失效点 3/4/5/6
      ▼
③ verify-source.sh <src>        ← 源码树校验（脏工作树 / 空子模块 / 指针漂移）
      ▼
④ 生成 manifest.json
      ▼
⑤ tar 打包（find + prune，不用 git archive）
      ▼
⑥ verify-source.sh --package   ← 闸门③：校验"包"本身，消灭失效点 2/7
      ▼
构建包 = <name>.tgz + <name>.manifest.json
```

### 三道闸门分别挡什么

| 闸门 | 机制 | 挡住的失效点 |
|---|---|---|
| ① 只接受远程分支名 | `git checkout --detach origin/$BRANCH`，脚本**不接受任意 SHA 入参** | #1 未推送代码 |
| ② 指针一致性断言 | `git -C <sub> rev-parse HEAD` == `git rev-parse HEAD:<sub>` | #3 #4 #5 #6 |
| ③ 包级校验 | 从 `.tgz` 里列文件、查关键路径、复算内容哈希 | #2 #7 |

---

## 4. 关键设计决策（及为什么）

### 4.1 只接受分支名，不接受 SHA

这是最重要的一条。如果 CI 允许传入任意 commit SHA，那么"本地未推送的提交"就能被构建出来——而这类问题**没有任何下游检查能发现**，因为整个链路上所有断言都会通过（它确实是一个合法的 git 对象）。把入参限制为远程分支名，让这类错误在**结构上不可能发生**。

### 4.2 不用 `git archive`

`git archive` 只导出该仓库跟踪的文件。子模块在父仓库里只是一个 **gitlink（一个 SHA）**，不是内容，所以：

```bash
git archive HEAD | tar -x   # ❌ vendor/ionet-ts 是空目录
tar -czf pkg.tgz .          # ✅ 含子模块实体内容
```

用 `git archive` 打出来的包，`pnpm install` 时会报找不到 workspace 包——但如果打包和编译分属两台机器，**你在部署机才会看到这个错误**，排查链被拉长。

### 4.3 不用 `--depth 1` / `--shallow-submodules`

浅克隆下，`git submodule update` 需要到子模块仓库取那个 pin 的提交。若它不是分支尖端，GitHub 可能拒绝按 SHA 取。今天 `62ab3f2` 恰好是 `dev` 尖端所以能用，但**父仓库 pin 落后于 dev 尖端是常态**（改完框架 → bump 指针 → dev 继续前进），届时构建会突然失败。构建机上省这点流量不值得。

### 4.4 校验"包"，而不是只校验工作树

工作树正确 ≠ 包正确。打包命令的 `--exclude`/`--prune` 写错、路径前缀差异、tar 行为差异，都只在包这一层暴露。所以闸门③必须**从 .tgz 重新读取**并复算哈希。

### 4.5 `tar` 必须加 `--no-recursion`（实测踩到的坑）

用 `find` 生成文件清单再 `tar -T` 打包时，清单里**同时含有目录和文件**。而 tar 默认会对清单中的目录**递归展开**，于是每个文件被重复打包：

```
重复份数 = 该文件的祖先目录数 + 1
```

实测（本仓库，GNU tar 1.35）：

| 路径 | 清单中的祖先目录 | 修正前份数 |
|---|---|---|
| `./package.json` | 无（`-mindepth 1` 排除了 `.`） | 1 |
| `./ai-docs/xxx.md` | `./ai-docs` | 2 |
| `./vendor/ionet-ts/packages/X/package.json` | 4 个 | **5** |

后果不只是包体虚增（**2380 条目 → 修正后 444**）：`find -prune` 排除掉的 `vendor/ionet-ts/.git`（gitlink 文件）会被 tar 的递归**重新捞回包里**——`-prune` 管不到 tar 的递归。

修法是给 tar 加 `--no-recursion`（清单已逐文件枚举，不会漏文件）。`verify-source.sh` 已把「重复条目」与「混入 `.git`/`node_modules`/`dist`」固化为硬失败。

---

## 5. manifest 与追溯

构建包旁放一份同名 `manifest.json`：

```json
{
  "schemaVersion": 1,
  "builtAt": "2026-09-12T06:00:00Z",
  "parent": {
    "url": "git@github.com:matcha-cult/idle-path-of-xiuxian.git",
    "branch": "master",
    "commit": "dbaa3fd..."
  },
  "submodules": [
    {
      "path": "vendor/ionet-ts",
      "url": "git@github.com:matcha-cult/ionet-ts.git",
      "commit": "62ab3f2138dbc81be38ee4747362336fac089390"
    }
  ],
  "toolchain": { "node": "v20.x", "pnpm": "9.0.0" },
  "contentHash": "sha256:..."
}
```

`contentHash` 是对源码树的**确定性哈希**：排除 `.git` / `node_modules` / `dist` 后，按路径排序、逐文件 sha256、再整体 sha256。它让：

- **部署机可以拒绝部署**被篡改或损坏的包（解包后复算哈希，与 manifest 比对）；
- **10 份留存构建包可以互相对账**——"上周那版和这版的框架代码到底一样不一样"变成一个字符串比较；
- **回滚可定位**：manifest 里的子模块 SHA 就是当时部署的框架版本。

这一步和 P0 的关系很直接：P0 落地后线协议会带 `requestId`/`kind`，服务端与前端版本错配会表现为"推送收不到 / 响应错位"。没有版本戳，就只能靠猜。

---

## 6. 凭据注意

`.gitmodules` 用的是 **SSH**（`git@github.com:matcha-cult/ionet-ts.git`）。构建机若无 SSH key，`git submodule update` 会以 `Permission denied (publickey)` 失败。

三种处理：

1. 构建机配 deploy key（推荐，只读）；
2. 或改用 HTTPS 并在构建机配 token：
   ```bash
   git config --global url."https://<token>@github.com/".insteadOf "git@github.com:"
   ```
3. 或把 `.gitmodules` 改成 HTTPS（会影响所有 clone 方，需团队一致）。

不要用 `ssh-keyscan` 之类"跳过校验"的手段绕过。

### 6.1 一个实测遇到的坑：`Bad owner or permissions on .../ssh_config.d/...`

本机 `ssh` 曾直接拒绝加载配置：

```
Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf
fatal: Could not read from remote repository.
Please make sure you have the correct access rights and the repository exists.
```

根因是该文件（指向 `/usr/lib/systemd/ssh_config.d/` 的符号链接）属主为 `nobody:nogroup`，而 ssh 只接受 **root 属主、且不可被他人写**的配置文件。这**与网络和鉴权完全无关**，但报错文案会把人引向"没权限 / 仓库不存在"，极易误判。

两种处理：

```bash
# 1) 修系统文件（需 root，推荐）
sudo chown root:root /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf

# 2) 不改系统，仅绕过该配置文件
GIT_SSH_COMMAND="ssh -F /dev/null" git clone ...
```

本文第 10 节的端到端演练即是在 `-F /dev/null` 下完成的。部署/构建机若与开发机同源（同一镜像），很可能带同样的问题，建议在 CI 脚本里显式设置 `GIT_SSH_COMMAND`。

---

## 7. 部署机侧

构建包已经内联了**全部源码**（含 vendor 实体内容），所以部署机**不需要 git、不需要网络**：

```bash
tar -xzf <name>.tgz -C "$APP_DIR"
bash verify-source.sh --package <name>.tgz     # 闸门③复验（可选但推荐）
pnpm install --frozen-lockfile
pnpm -w run build          # 必须 -r：框架 dist 是 server 编译的前置产物
```

两个提醒：

- **`pnpm -w run build` 不能换成 `build:server`**。框架包只暴露 `dist/`（`main`/`types`/`exports` 全部指向 `dist`），而 server 的 tsconfig 没有任何指向 vendor 源码的 `paths` 映射。只跑 `build:server` 会拿陈旧或缺失的 `dist` 编译——纯行为类修复（例如 `sendTo` 那种不改类型的修复）在 tsc 下**零警告**，会静默产出错误产物。
- `dist/` 被 gitignore 且未跟踪，所以构建包里天然没有它，每次全量重建（`tsup` 配了 `clean: true`），不存在增量残留。

---

## 8. 落地清单

- [ ] 确认 `git@github.com:matcha-cult/idle-path-of-xiuxian.git` 可达，且构建机有读权限
- [ ] 确认构建机对框架仓库有读权限（deploy key 或 token）
- [ ] 把 `fetch-source.sh` + `verify-source.sh` 放到构建机
- [ ] 构建脚本接入：取源 → 校验 → 打包 → 存 manifest
- [ ] 部署脚本接入：解包 → 复验 → `pnpm install --frozen-lockfile` → `pnpm -w run build`
- [ ] 触发一次构建，确认 `vendor/ionet-ts/packages/*/package.json` 在包内**真实存在**
- [ ] 故意制造一次失败（如手工把 submodule 切到别的提交），确认闸门②能拦住

---

## 9. 附录：脚本

| 文件 | 用途 |
|---|---|
| `fetch-source.sh` | 构建机侧入口：clone → 子模块 → 校验 → manifest → 打包 → 包校验 |
| `verify-source.sh` | 校验器。`verify-source.sh <dir>` 校验源码树；`--package <tgz>` 校验构建包；`--hash <dir>` 输出 contentHash |

> **CI 平台是 Spug？** 见 [`02-Spug-接入方案.md`](./02-Spug-接入方案.md)。Spug 的检出步骤无法附加 `--recurse-submodules`，且执行步骤拿不到 SSH key——该文档给出零凭据（HTTPS）的绕开方案。注意 §11 的"就地修复"只适用于**有 `.git` 的检出目录**，Spug 导出的纯文件树用不了。

---

## 10. 验证记录

两个脚本已在本机做过端到端实跑（用父仓库的**裸克隆**冒充 GitHub，用 `url.<本地路径>.insteadOf` 把框架的 SSH 地址重写到本地仓库，全程离线）。

**正向链路**

```
[3/6] Submodule path 'vendor/ionet-ts': checked out '62ab3f2138db...'
[4/6] 源码树校验通过   （工作树干净 / 对齐 pin / 含 15 个 package.json）
[6/6] 构建包校验通过
        [ OK ] 无重复条目
        [ OK ] 无 VCS 元数据与构建产物
        [ OK ] 关键路径齐全（8 项）
        [ OK ] 包内框架包数量: 9
        [ OK ] contentHash 一致: 9a298ba1ef4ff5c9...
产物: idle-path-dbaa3fd7-20260912T071909Z.tgz   436K / 444 条目
```

**反向用例**（闸门确实拦得住）

| 用例 | 期望 | 实际 |
|---|---|---|
| A. `git archive` 式包（vendor 为空） | 拒绝 | ✅ `[FAIL] 构建包缺少 ./pnpm-workspace.yaml` |
| B. 含重复条目的包 | 拒绝 | ✅ `[FAIL] 构建包存在重复条目（tar 是否漏了 --no-recursion？）` |
| C. 篡改包内文件内容 | 拒绝 | ✅ `[FAIL] contentHash 不匹配 want=9a298ba1... have=da7cfa37...` |

C 是最有价值的一条：它证明"构建机算哈希 → 部署机复算"这条链路能把**任何内容改动**（包括传输损坏、人为篡改、打包脚本回归）变成一次硬失败。

> 复现方式：把 `README.md` 里假设的父仓库 URL 换成本地裸克隆路径，并设置
> `url.<本地框架仓库>.insteadOf = git@github.com:matcha-cult/ionet-ts.git` 与
> `protocol.file.allow=always` 即可离线跑通同一套流程。

---

## 11. 故障修复：主仓库已检出，但 `vendor/ionet-ts` 是空的

典型症状：CI 的检出步骤没带 `--recurse-submodules`（或自定义检出工具不处理子模块）。主仓库在位，`vendor/ionet-ts` 是**空目录**。此时 `pnpm install` 无法把 `workspace:*` 依赖解析到具体包（`pnpm-workspace.yaml` 里的 `vendor/ionet-ts/packages/*` 匹配不到任何工作区包），构建必然失败。

### 先诊断

```bash
cd <repo>
git submodule status          # 看前缀，不要只看目录"存不存在"
ls -A vendor/ionet-ts | wc -l # 未初始化时为 0
```

| `git submodule status` 前缀 | 含义 | 处理 |
|---|---|---|
| `-` | **未初始化**（空目录） | 执行下面的修复命令 |
| 空格 | 已就绪且对齐 pin | 无需处理 |
| `+` | 已初始化，但**提交不对** | `git submodule update --init --recursive --force`，**不要删目录** |

### 修复（幂等，可反复执行）

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

`sync` 会把 `.gitmodules` 里的 URL 重新写入 `.git/config`，避免上一次失败留下的配置继续生效。

### 修复后必须做

```bash
bash verify-source.sh .            # 确认对齐 pin、内容非空
pnpm install --frozen-lockfile     # 必须在子模块就位之后重跑
```

在子模块初始化**之前**跑过的 `pnpm install` 结果是无效的（工作区里少了 9 个包），必须重跑。

### 两个实测陷阱

**陷阱 1 —— ssh 配置**（详见 §6.1）。若报 `Bad owner or permissions on .../ssh_config.d/...`，实测该错误会让 `submodule update` 直接失败：

```bash
GIT_SSH_COMMAND="ssh -F /dev/null" git submodule update --init --recursive
```

**陷阱 2 —— 目录非空残留**。若 `vendor/ionet-ts` 里已有上次失败尝试留下的文件，git 会拒绝克隆进非空目录：

```
fatal: destination path 'vendor/ionet-ts' already exists and is not an empty directory.
```

清空后重试（该目录本就只应容纳子模块内容）：

```bash
rm -rf vendor/ionet-ts
git submodule update --init --recursive
```

### 根治：让 CI 在检出时就带上子模块

```bash
git clone --recurse-submodules <parent-url> <dir>
```

若检出由 CI 平台工具完成、加不了参数，则在检出后**无条件**执行一次 `git submodule update --init --recursive`——幂等，已就绪时开销极小。

### 实测记录（模拟"漏检子模块"的检出）

```
$ git submodule status
-62ab3f2138dbc81be38ee4747362336fac089390 vendor/ionet-ts   ← 前缀 '-'，未初始化
$ ls -A vendor/ionet-ts | wc -l
0

$ GIT_SSH_COMMAND="ssh -o BatchMode=yes" git submodule update --init --recursive
Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf
fatal: Could not read from remote repository.                    ← 陷阱 1 复现

$ GIT_SSH_COMMAND="ssh -F /dev/null ..." git submodule sync --recursive
$ GIT_SSH_COMMAND="ssh -F /dev/null ..." git submodule update --init --recursive
Submodule path 'vendor/ionet-ts': checked out '62ab3f2138db...'
$ git submodule status
 62ab3f2138dbc81be38ee4747362336fac089390 vendor/ionet-ts (remotes/origin/dev)   ← 前缀空格

$ bash verify-source.sh .
  [ OK ] vendor/ionet-ts 对齐 pin 62ab3f2138db
  [ OK ] vendor/ionet-ts 工作树干净
  [ OK ] vendor/ionet-ts 含 15 个 package.json
[verify] 源码树校验通过
```
