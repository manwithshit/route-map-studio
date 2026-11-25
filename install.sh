#!/usr/bin/env bash
# 路线地图工作台一键安装：下载代码 → 安装依赖 → 启动并打开浏览器。
# 用法：curl -fsSL https://raw.githubusercontent.com/manwithshit/route-map-studio/main/install.sh | bash
# 可选环境变量：
#   ROUTE_MAP_DIR   安装目录，默认 ~/route-map-studio
#   ROUTE_MAP_REPO  代码仓库地址，默认 GitHub 上的 manwithshit/route-map-studio
#   NO_START=1      只安装，不启动
set -euo pipefail

# 整个脚本包在函数里：通过 curl | bash 运行时，bash 先读完全部内容再执行，
# 下载中断不会只执行半截，子命令也不会读走后面的脚本。
main() {
	REPO="${ROUTE_MAP_REPO:-https://github.com/manwithshit/route-map-studio.git}"
	DIR="${ROUTE_MAP_DIR:-$HOME/route-map-studio}"

	say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
	fail() {
		printf '\033[1;31m✗\033[0m %s\n' "$*" >&2
		exit 1
	}

	normalize_repo() {
		printf '%s' "$1" | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##; s#/$##' | tr '[:upper:]' '[:lower:]'
	}

	# 1. 环境检查：只在 Apple 芯片 Mac 上验证过（渲染依赖 darwin-arm64 的原生组件）
	[ "$(uname -s)" = "Darwin" ] || fail "目前只支持 macOS。"
	[ "$(uname -m)" = "arm64" ] || fail "目前只支持 Apple 芯片（M 系列）的 Mac。"
	command -v git >/dev/null || fail "没找到 git。先在终端运行 xcode-select --install，装好后再运行这条安装命令。"
	command -v node >/dev/null || fail "没找到 Node.js。到 https://nodejs.org 下载 22 版（LTS）安装，或运行 brew install node@22，再运行这条安装命令。"
	NODE_VER="$(node -p 'process.versions.node')"
	NODE_MAJOR="${NODE_VER%%.*}"
	NODE_REST="${NODE_VER#*.}"
	NODE_MINOR="${NODE_REST%%.*}"
	NODE_OK=0
	if [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -ge 12 ]; then
		NODE_OK=1
	elif [ "$NODE_MAJOR" -eq 24 ] || [ "$NODE_MAJOR" -ge 26 ]; then
		NODE_OK=1
	fi
	if [ "$NODE_OK" -ne 1 ]; then
		fail "Node.js 版本是 v$NODE_VER，需要 22.12+（LTS）、24.x 或 26+。到 https://nodejs.org 下载 22 版（LTS）。"
	fi

	# 没装 pnpm 时用 npx 临时调用，不改动全局环境
	if command -v pnpm >/dev/null; then PNPM=(pnpm); else PNPM=(npx --yes pnpm@10); fi

	# 2. 下载或更新代码（更新前严格验证仓库身份与分支，绝不误操作无关 Git 目录）
	if [ -d "$DIR/.git" ]; then
		EXISTING_REMOTE="$(git -C "$DIR" remote get-url origin 2>/dev/null || true)"
		if [ "$(normalize_repo "$EXISTING_REMOTE")" != "$(normalize_repo "$REPO")" ]; then
			fail "$DIR 已有其他 Git 仓库（origin=$EXISTING_REMOTE）。请换目录：ROUTE_MAP_DIR=~/Apps/route-map-studio"
		fi
		if [ ! -f "$DIR/package.json" ] || ! grep -q '"name"[[:space:]]*:[[:space:]]*"route-map-studio"' "$DIR/package.json"; then
			fail "$DIR 不是 route-map-studio 项目目录，已中止更新。"
		fi
		CURRENT_BRANCH="$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
		[ "$CURRENT_BRANCH" = "main" ] || fail "$DIR 当前不在 main 分支（$CURRENT_BRANCH）。请先切回 main 或指定新的 ROUTE_MAP_DIR。"
		say "更新已有安装：$DIR"
		git -C "$DIR" pull --ff-only origin main || fail "更新失败：$DIR 里有本地改动或分支分叉。先处理改动，或设置 ROUTE_MAP_DIR 装到别的目录。"
	elif [ -e "$DIR" ]; then
		fail "$DIR 已存在但不是这个项目。删掉它，或设置 ROUTE_MAP_DIR 装到别的目录。"
	else
		say "下载代码到 $DIR"
		git clone --depth 1 "$REPO" "$DIR"
	fi

	# 3. 安装依赖（首次约 1–3 分钟）
	cd "$DIR"
	say "安装依赖…"
	"${PNPM[@]}" install --frozen-lockfile

	say "安装完成。以后启动：cd \"$DIR\" && ${PNPM[*]} start"
	[ -n "${NO_START:-}" ] && exit 0

	# 4. 启动。通过 curl | bash 运行时标准输入是管道，改从终端读，Ctrl+C 才能正常停止服务
	say "启动工作台，浏览器会自动打开 http://127.0.0.1:${PORT:-5317}（按 Ctrl+C 停止）"
	if [ ! -t 0 ] && (: </dev/tty) 2>/dev/null; then exec "${PNPM[@]}" start </dev/tty; else exec "${PNPM[@]}" start; fi
}

main "$@"
