#!/usr/bin/env bash
# ============================================================================
# fetch-source.sh —— 构建机侧入口：从 GitHub 取出确定性源码树 → 校验 → 打包
#
# 用法:
#   fetch-source.sh <parent-git-url> <branch> <out-dir>
#
# 例:
#   fetch-source.sh git@github.com:matcha-cult/idle-path-of-xiuxian.git master /var/ci/artifacts
#
# 产物（位于 <out-dir>）:
#   idle-path-<shortsha>-<utc>.tgz           完整源码构建包（含 vendor 子模块实体内容）
#   idle-path-<shortsha>-<utc>.manifest.json 父/子模块 commit + contentHash
#   idle-path-<shortsha>-<utc>.tgz.sha256    包本身的校验和
#
# 设计要点（对应 README 第 4 节）:
#   * 只接受「远程分支名」，不接受任意 SHA —— 结构性杜绝本地未推送代码混入。
#   * 不用 --depth 1 / --shallow-submodules —— 浅克隆下若 pin 的子模块提交不是分支
#     尖端，git submodule update 会失败。
#   * 不用 git submodule update --remote —— 那会漂移到 dev 尖端，破坏可复现性。
#   * 不用 git archive —— 它只导出父仓库跟踪的文件，子模块在父仓库里只是个
#     gitlink(SHA)，所以打出来的包 vendor/ 是空的。
# ============================================================================
set -euo pipefail

PARENT_URL="${1:?用法: fetch-source.sh <parent-git-url> <branch> <out-dir>}"
BRANCH="${2:?缺少 branch}"
OUT_DIR="${3:?缺少 out-dir}"

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VERIFY="$HERE/verify-source.sh"
[ -f "$VERIFY" ] || { echo "缺少 $VERIFY" >&2; exit 1; }

mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
SRC="$WORK/src"

echo "==> [1/6] 全新克隆 $PARENT_URL"
git clone --quiet "$PARENT_URL" "$SRC"

echo "==> [2/6] 检出远程分支尖端 origin/$BRANCH"
git -C "$SRC" fetch --quiet --prune origin
git -C "$SRC" checkout --quiet --detach "origin/$BRANCH"
PARENT_SHA=$(git -C "$SRC" rev-parse HEAD)
echo "    父仓库 commit = $PARENT_SHA"

echo "==> [3/6] 递归取子模块并强制对齐 pin"
git -C "$SRC" submodule sync --recursive --quiet
git -C "$SRC" submodule update --init --recursive --jobs 4

echo "==> [4/6] 校验源码树（闸门②）"
bash "$VERIFY" "$SRC"

echo "==> [5/6] 计算 contentHash 并写入 manifest.json"
CONTENT_HASH=$(bash "$VERIFY" --hash "$SRC")
SUBMODULES_JSON="[]"
if [ -f "$SRC/.gitmodules" ]; then
  entries=""
  while read -r p; do
    [ -n "$p" ] || continue
    url=$(git -C "$SRC" config -f .gitmodules --get "submodule.$p.url" || echo "")
    sha=$(git -C "$SRC/$p" rev-parse HEAD)
    entry=$(printf '    {\n      "path": "%s",\n      "url": "%s",\n      "commit": "%s"\n    }' "$p" "$url" "$sha")
    if [ -z "$entries" ]; then entries="$entry"; else entries="$entries,
$entry"; fi
  done < <(git -C "$SRC" config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')
  if [ -n "$entries" ]; then
    SUBMODULES_JSON="[
$entries
  ]"
  fi
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="idle-path-${PARENT_SHA:0:8}-${STAMP}"
PKG="$OUT_DIR/$NAME.tgz"
MANIFEST="$OUT_DIR/$NAME.manifest.json"

# 注意：manifest 写在源码树根部，随包一起分发，使每份构建包自描述。
# content_hash 排除了 ./manifest.json，所以这里不会造成循环依赖。
cat > "$SRC/manifest.json" <<EOF
{
  "schemaVersion": 1,
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "parent": {
    "url": "$PARENT_URL",
    "branch": "$BRANCH",
    "commit": "$PARENT_SHA"
  },
  "submodules": $SUBMODULES_JSON,
  "toolchain": {
    "node": "$(node -v 2>/dev/null || echo unknown)",
    "pnpm": "$(pnpm -v 2>/dev/null || echo unknown)"
  },
  "contentHash": "sha256:$CONTENT_HASH"
}
EOF
cp "$SRC/manifest.json" "$MANIFEST"

echo "==> [6/6] 打包并校验包内容（闸门③）"
# 用 find + prune 生成文件清单，再用 tar -T 打包：
# 排除规则显式，且不受 --exclude 与 "./" 前缀的匹配歧义影响。
( cd "$SRC" && find . -mindepth 1 \
    \( -name .git -o -name node_modules -o -name dist \) -prune -o \
    -print0 > "$WORK/filelist" )
# --no-recursion 必不可少：清单里同时含目录与文件，而 tar 默认会递归展开目录，
# 导致每个文件被重复打包（次数 = 祖先目录数 + 1），且会把 find 已排除的
# .git 等内容重新捞回来。清单已逐文件枚举，因此关闭递归不会漏文件。
tar --null --no-recursion -czf "$PKG" -C "$SRC" -T "$WORK/filelist"

bash "$VERIFY" --package "$PKG"

( cd "$OUT_DIR" && sha256sum "$(basename "$PKG")" > "$(basename "$PKG").sha256" )

echo
echo "构建包:   $PKG"
echo "manifest: $MANIFEST"
echo "sha256:   $PKG.sha256"
