// 本地配置：高德 Key 存在项目根目录 config.local.json（已 .gitignore），不进仓库。
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const FILE = fileURLToPath(new URL('../config.local.json', import.meta.url));

type Stored = {amapKey?: string};

const read = (): Stored => {
	if (!existsSync(FILE)) return {};
	try {
		return JSON.parse(readFileSync(FILE, 'utf8'));
	} catch {
		return {};
	}
};

export const getAmapKey = () => process.env.AMAP_WEB_KEY || read().amapKey || '';
export const setAmapKey = (key: string) => writeFileSync(FILE, JSON.stringify({...read(), amapKey: key}, null, 2));
export const maskKey = (key: string) => (key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '');
