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

	# 1. 环境检查：只在 Apple 芯片 Mac 上验证过（渲染依赖 darwin-arm64 的原生组件）
	[ "$(uname -s)" = "Darwin" ] || fail "目前只支持 macOS。"
	[ "$(uname -m)" = "arm64" ] || fail "目前只支持 Apple 芯片（M 系列）的 Mac。"
	command -v git >/dev/null || fail "没找到 git。先在终端运行 xcode-select --install，装好后再运行这条安装命令。"
	command -v node >/dev/null || fail "没找到 Node.js。到 https://nodejs.org 下载 22 版（LTS）安装，或运行 brew install node@22，再运行这条安装命令。"
	NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
	[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 版本是 $(node -v)，需要 20 或更高。到 https://nodejs.org 下载 22 版（LTS）。"

	# 没装 pnpm 时用 npx 临时调用，不改动全局环境
	if command -v pnpm >/dev/null; then PNPM=(pnpm); else PNPM=(npx --yes pnpm@10); fi

	# 2. 下载或更新代码
	if [ -d "$DIR/.git" ]; then
		say "更新已有安装：$DIR"
		git -C "$DIR" pull --ff-only || fail "更新失败：$DIR 里有本地改动。先处理改动，或设置 ROUTE_MAP_DIR 装到别的目录。"
	elif [ -e "$DIR" ]; then
		fail "$DIR 已存在但不是这个项目。删掉它，或设置 ROUTE_MAP_DIR 装到别的目录。"
	else
		say "下载代码到 $DIR"
		git clone --depth 1 "$REPO" "$DIR"
	fi

	# 3. 安装依赖（首次约 1–3 分钟）
	cd "$DIR"
	say "安装依赖…"
	"${PNPM[@]}" install

	say "安装完成。以后启动：cd \"$DIR\" && ${PNPM[*]} start"
	[ -n "${NO_START:-}" ] && exit 0

	# 4. 启动。通过 curl | bash 运行时标准输入是管道，改从终端读，Ctrl+C 才能正常停止服务
	say "启动工作台，浏览器会自动打开 http://127.0.0.1:${PORT:-5317}（按 Ctrl+C 停止）"
	if [ ! -t 0 ] && (: </dev/tty) 2>/dev/null; then exec "${PNPM[@]}" start </dev/tty; else exec "${PNPM[@]}" start; fi
}

main "$@"
