#!/usr/bin/env bash
# ============================================================================
# verify-source.sh —— 源码树 / 构建包 完整性校验器
#
# 用法:
#   verify-source.sh <dir>              # 模式1：校验已初始化的源码树（需 .git）
#   verify-source.sh --package <tgz>    # 模式2：校验构建包（无需 .git）
#   verify-source.sh --hash <dir>       # 模式3：仅输出 contentHash（供 fetch 复用）
#
# 模式1 检查：父工作树干净 / 子模块已初始化 / 子模块 HEAD == 父仓库 gitlink
#             / 子模块工作树干净 / 内容非空
# 模式2 检查：包内关键路径存在 / vendor 子模块内容非空 / manifest 存在且可解析
#             / 复算 contentHash 与 manifest 一致
#
# 退出码: 0 = 通过, 1 = 校验失败
# ============================================================================
set -euo pipefail

die()  { echo "  [FAIL] $*" >&2; exit 1; }
pass() { echo "  [ OK ] $*"; }

# --- 共用的哈希算法：排除 .git / node_modules / dist / 根 manifest.json，按路径排序后整体 sha256 ---
# 排除 ./manifest.json 是为了打破循环：manifest 里存了 contentHash，它本身不能参与哈希计算。
content_hash() {
  local dir="$1"
  (
    cd "$dir"
    find . -mindepth 1 \
      \( -name .git -o -name node_modules -o -name dist \) -prune -o \
      -path './manifest.json' -prune -o \
      -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    | sha256sum | cut -d' ' -f1
  )
}

# --- 期望存在的关键路径（按需增删） ---
KEY_PATHS=(
  "./package.json"
  "./pnpm-workspace.yaml"
  "./packages/server/package.json"
  "./vendor/ionet-ts/package.json"
  "./vendor/ionet-ts/packages/core-framework/package.json"
  "./vendor/ionet-ts/packages/core-framework/src/index.ts"
  "./vendor/ionet-ts/packages/extension-nestjs/package.json"
  "./vendor/ionet-ts/packages/external-server/package.json"
)

# ============================================================================
# 模式 2：校验构建包
# ============================================================================
verify_package() {
  local tgz="$1"
  echo "[verify] 构建包模式: $tgz"
  [ -f "$tgz" ] || die "文件不存在: $tgz"

  local listing
  listing=$(tar -tzf "$tgz") || die "无法读取 tar 包"

  # 0) 禁止重复条目。tar 默认递归展开目录，若文件清单里同时含目录与文件，
  #    每个文件会被打包「祖先目录数 + 1」次，包体虚增且内容不再可信。
  local dups
  dups=$(sort <<<"$listing" | uniq -d)
  if [ -n "$dups" ]; then
    echo "$dups" | head -10 >&2
    die "构建包存在重复条目（tar 是否漏了 --no-recursion？）"
  fi
  pass "无重复条目"

  # 0b) 禁止 VCS 元数据与构建产物
  local bad
  bad=$(grep -E '(^|/)(\.git|node_modules|dist)(/|$)' <<<"$listing" | head -10 || true)
  if [ -n "$bad" ]; then
    echo "$bad" >&2
    die "构建包混入了 .git / node_modules / dist"
  fi
  pass "无 VCS 元数据与构建产物"

  # 1) 关键路径必须在包内
  local f
  for f in "${KEY_PATHS[@]}"; do
    grep -qxF "$f" <<<"$listing" \
      || die "构建包缺少 $f  （典型症状：用 git archive 打包，子模块内容丢失）"
  done
  pass "关键路径齐全（${#KEY_PATHS[@]} 项）"

  # 2) 子模块内容非空
  local n
  n=$(grep -c '^\./vendor/ionet-ts/packages/[^/]*/package\.json$' <<<"$listing" || true)
  [ "$n" -gt 0 ] || die "包内 vendor/ionet-ts/packages/*/package.json 数量为 0（子模块内容为空）"
  pass "包内框架包数量: $n"

  # 3) 解包复算 contentHash
  local tmp
  tmp=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  tar -xzf "$tgz" -C "$tmp"

  [ -f "$tmp/manifest.json" ] || die "包内缺少 manifest.json"
  local want have
  want=$(sed -n 's/.*"contentHash"[[:space:]]*:[[:space:]]*"sha256:\([0-9a-f]*\)".*/\1/p' "$tmp/manifest.json")
  [ -n "$want" ] || die "manifest.json 中解析不出 contentHash"
  have=$(content_hash "$tmp")
  [ "$want" = "$have" ] || die "contentHash 不匹配 want=$want have=$have"
  pass "contentHash 一致: ${have:0:16}..."

  echo "[verify] 构建包校验通过"
}

# ============================================================================
# 模式 1：校验源码树
# ============================================================================
verify_tree() {
  local root="$1"
  echo "[verify] 源码树模式: $root"
  [ -d "$root" ] || die "目录不存在: $root"
  cd "$root"

  # 1) 必须是 git 工作树
  [ -e .git ] || die "不是 git 工作树（缺少 .git）"
  pass "git 工作树存在"

  # 2) 父仓库工作树必须干净 —— 杜绝未提交改动被打进构建包
  local dirty
  dirty=$(git status --porcelain --ignore-submodules=none)
  if [ -n "$dirty" ]; then
    echo "$dirty" | head -20 >&2
    die "父仓库工作树不干净（上方为改动清单）"
  fi
  pass "父仓库工作树干净"

  local parent_sha
  parent_sha=$(git rev-parse HEAD)
  pass "父仓库 HEAD = ${parent_sha:0:12}"

  # 3) 无子模块则结束
  [ -f .gitmodules ] || { pass "无子模块，跳过"; echo "[verify] 源码树校验通过"; return 0; }

  # 4) 逐个校验子模块
  local p
  while read -r p; do
    [ -n "$p" ] || continue
    echo "[verify]  子模块 $p"

    [ -e "$p" ] || die "$p 不存在（git submodule update --init 未执行）"
    [ -e "$p/.git" ] || die "$p 未初始化（是空目录，不是子模块工作树）"

    local want have
    want=$(git rev-parse "HEAD:$p")      # 父仓库 commit 中记录的 gitlink
    have=$(git -C "$p" rev-parse HEAD)   # 子模块实际的 HEAD
    [ "$want" = "$have" ] \
      || die "$p 指针漂移 want=${want:0:12} have=${have:0:12}（检查是否误用了 --remote）"
    pass "$p 对齐 pin ${have:0:12}"

    [ -z "$(git -C "$p" status --porcelain)" ] || die "$p 工作树不干净"
    pass "$p 工作树干净"

    local n
    n=$(find "$p" -name package.json -not -path '*/node_modules/*' | wc -l)
    [ "$n" -gt 0 ] || die "$p 内容为空"
    pass "$p 含 $n 个 package.json"
  done < <(git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')

  echo "[verify] 源码树校验通过"
}

# ============================================================================
case "${1:-}" in
  --package)
    verify_package "${2:?用法: verify-source.sh --package <tgz>}"
    ;;
  --hash)
    content_hash "${2:?用法: verify-source.sh --hash <dir>}"
    ;;
  "")
    die "用法: verify-source.sh <dir> | --package <tgz> | --hash <dir>"
    ;;
  *)
    verify_tree "$1"
    ;;
esac
