// 本地配置：高德 Key 保存在 Web 根目录之外（~/.config/route-map-studio/config.local.json），
// 权限 0600，绝不进入仓库、也无法通过本地 HTTP 服务读取。
import {chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const LEGACY_FILE = fileURLToPath(new URL('../config.local.json', import.meta.url));
const getConfigPath = () =>
	process.env.ROUTE_MAP_CONFIG_FILE ? path.resolve(process.env.ROUTE_MAP_CONFIG_FILE) : path.join(os.homedir(), '.config', 'route-map-studio', 'config.local.json');

type Stored = {amapKey?: string};

const readJson = (file: string): Stored => {
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return {};
	}
};

const writeJson = (file: string, data: Stored) => {
	const dir = path.dirname(file);
	mkdirSync(dir, {recursive: true, mode: 0o700});
	writeFileSync(file, JSON.stringify(data, null, 2), {mode: 0o600});
	try {
		chmodSync(file, 0o600);
	} catch {
		/* 非 POSIX 忽略 */
	}
};

// 平滑迁移旧版位于项目根目录的 config.local.json，迁移后删除旧文件，避免残留于 Web 根下
const migrateLegacyIfNeeded = (targetFile: string) => {
	if (process.env.ROUTE_MAP_CONFIG_FILE) return;
	if (!existsSync(LEGACY_FILE)) return;
	if (!existsSync(targetFile)) {
		const legacy = readJson(LEGACY_FILE);
		if (legacy.amapKey) writeJson(targetFile, legacy);
	}
	try {
		unlinkSync(LEGACY_FILE);
	} catch {
		/* 忽略 */
	}
};

const read = (): Stored => {
	const file = getConfigPath();
	migrateLegacyIfNeeded(file);
	return readJson(file);
};

export const getAmapKey = () => process.env.AMAP_WEB_KEY || read().amapKey || '';
export const setAmapKey = (key: string) => {
	const file = getConfigPath();
	migrateLegacyIfNeeded(file);
	writeJson(file, {...readJson(file), amapKey: key});
};
// 删除本机保存的 Key；文件里没有别的配置时连文件一起删
export const clearAmapKey = () => {
	const file = getConfigPath();
	migrateLegacyIfNeeded(file);
	const {amapKey: _, ...rest} = readJson(file);
	if (Object.keys(rest).length) writeJson(file, rest);
	else if (existsSync(file)) unlinkSync(file);
};
export const maskKey = (key: string) => (key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '');
export const configFilePath = () => getConfigPath();
