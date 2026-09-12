# Spug 接入方案：在无法使用 `--recurse-submodules` 的执行步骤里补齐子模块

> 前提：CI 平台是 **Spug**。已知两个限制：
> 1. Spug 的 Git 检出步骤**无法附加** `--recurse-submodules`；
> 2. Spug 的自定义执行步骤**拿不到检出用的 SSH key**。
>
> 结论：不要在 Spug 的检出结果上做修补（那份目录里连 `.git` 都没有），而是**在执行步骤里自行做一次带子模块的检出**。

---

## 1. 关键发现：两个仓库都是公开的（实测）

| 仓库 | 匿名 HTTPS |
|---|---|
| `https://github.com/matcha-cult/ionet-ts.git` | ✅ 公开可读（2 个分支） |
| `https://github.com/matcha-cult/idle-path-of-xiuxian.git` | ✅ 公开可读（1 个分支） |

**公开 = 零凭据可读**。这直接消灭了"执行步骤拿不到 SSH key"的问题——改用 HTTPS，根本不需要 key。

附带好处：HTTPS 不经过 ssh，所以之前那个 `Bad owner or permissions on .../ssh_config.d/...` 的系统配置坑也一并消失了。

## 2. 但有个陷阱：`.gitmodules` 写的是 SSH 地址

即使仓库公开，`--recurse-submodules` 仍会按 `.gitmodules` 里的 `git@github.com:...` 去连，于是照样要 key。实测对比：

```
A) git clone --recurse-submodules <https 父仓库>
   fatal: clone of 'git@github.com:matcha-cult/ionet-ts.git' into submodule path
   '.../vendor/ionet-ts' failed                                    ← 失败

B) git -c url."https://github.com/".insteadOf="git@github.com:" \
        clone --recurse-submodules <https 父仓库>
   子模块 HEAD: 62ab3f2138dbc81be38ee4747362336fac089390
   父仓库记录:  62ab3f2138dbc81be38ee4747362336fac089390            ← 成功且精确对齐 pin
   packages 数: 9
```

`insteadOf` 把 SSH 地址在**使用前**重写成 HTTPS，无需改动仓库里的任何文件。

## 3. 完整方案

核心思路：**Spug 的执行步骤不依赖检出结果，自己 clone 一份干净的、带子模块的工作树。**

这样做还有个额外红利：pin（父仓库记录的框架提交）由 clone 自身保证，**不需要额外的 pin 文件**，也不存在"pin 文件与 gitlink 不同步"的风险。

### 3.1 最小可用脚本（可直接粘贴到 Spug 执行步骤）

```bash
#!/usr/bin/env bash
set -euo pipefail

# ---------- 配置（按你的 Spug 环境调整）----------
PARENT_URL="https://github.com/matcha-cult/idle-path-of-xiuxian.git"
REF="${SPUG_GIT_BRANCH:-master}"        # 若 Spug 暴露的是 tag/commit，见 3.2
SRC="${SPUG_WORKSPACE:-$PWD}/src"       # 真正的检出目录，与 Spug 导出目录分开

# ---------- 零凭据访问 GitHub ----------
export GIT_TERMINAL_PROMPT=0            # 缺凭据时立即失败，不要挂起等输入
git config --global url."https://github.com/".insteadOf "git@github.com:"

# ---------- 自行检出（带子模块）----------
rm -rf "$SRC"
git clone --recurse-submodules "$PARENT_URL" "$SRC"
cd "$SRC"

# ---------- 可选：构建特定提交而非分支尖端 ----------
if [ -n "${SPUG_GIT_COMMIT_ID:-}" ]; then
  git checkout --detach "$SPUG_GIT_COMMIT_ID"
  git submodule update --init --recursive
fi

# ---------- 固化 pin 到构建日志（追溯用）----------
echo "parent=$(git rev-parse HEAD)"
git submodule status --recursive

# ---------- 编译 ----------
pnpm install --frozen-lockfile
pnpm -w run build
```

### 3.2 Spug 暴露哪些变量

不同 Spug 版本变量名不同，先探测一次：

```bash
env | grep -i spug | sort
```

常见的有 `SPUG_GIT_BRANCH`、`SPUG_GIT_TAG`、`SPUG_GIT_COMMIT_ID`、`SPUG_WORKSPACE`。按实际存在的那个改写 `REF` / 提交号分支即可。

### 3.3 为什么必须 `pnpm -w run build`

框架包只通过 `dist/` 暴露（`main`/`types`/`exports` 全指向 `dist`），而 server 的 tsconfig 没有任何指向 vendor 源码的 `paths` 映射。只跑 `build:server` 会拿陈旧 `dist` 编译——**纯行为类修复在 tsc 下零警告**，会静默产出错误产物。

## 4. 可选：改用构建包模式（配合"部署机执行部署"）

你的分工是"构建机检出、部署机部署"。若两者分离，把上面的 clone 换成产出一个**已校验的构建包**更合适：

```bash
# 在 Spug 执行步骤里
export GIT_TERMINAL_PROMPT=0
git config --global url."https://github.com/".insteadOf "git@github.com:"

bash fetch-source.sh \
  https://github.com/matcha-cult/idle-path-of-xiuxian.git \
  "${SPUG_GIT_BRANCH:-master}" \
  /data/artifacts
```

产出 `*.tgz` + `*.manifest.json` + `*.tgz.sha256`。部署机解包后复验一次即可，**不需要 git、不需要网络**。

## 5. 可选：把 `.gitmodules` 改成 HTTPS（一劳永逸）

既然两个仓库都是公开的，把 `.gitmodules` 里的 URL 从 SSH 改成 HTTPS：

```diff
 [submodule "vendor/ionet-ts"]
 	path = vendor/ionet-ts
-	url = git@github.com:matcha-cult/ionet-ts.git
+	url = https://github.com/matcha-cult/ionet-ts.git
```

好处：所有消费方（CI、其他开发机）取子模块都不再需要 SSH key，CI 脚本里的 `insteadOf` 也可以去掉。

不影响你的开发机：本机 `.git/config` 里的 `submodule.vendor/ionet-ts.url = <framework-workspace>` 覆盖项优先级更高，仍走本地路径。推送父仓库用的 remote 也不受影响（`.gitmodules` 只管子模块）。

代价：若哪天框架仓库转为私有，HTTPS 就需要凭据了。

## 6. 实测记录

```
$ git ls-remote --heads https://github.com/matcha-cult/ionet-ts.git
62ab3f2138dbc81be38ee4747362336fac089390  refs/heads/dev      ← 匿名可读
aab54fc0944c87aa43504fde64e4583fd10ade47  refs/heads/master

$ git clone --recurse-submodules <https://父仓库>
fatal: clone of 'git@github.com:matcha-cult/ionet-ts.git' ... failed   ← 陷阱复现

$ git -c url."https://github.com/".insteadOf="git@github.com:" \
      clone --recurse-submodules <https://父仓库>
子模块 HEAD: 62ab3f2138dbc81be38ee4747362336fac089390
父仓库记录:  62ab3f2138dbc81be38ee4747362336fac089390
packages 数: 9                                                          ← 零凭据成功
```

框架仓库全量 clone 仅 **464K**，构建机上的开销可以忽略。
