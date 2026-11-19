// 本地配置：高德 Key 存在项目根目录 config.local.json（已 .gitignore），不进仓库。
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
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
// 删除本机保存的 Key；文件里没有别的配置时连文件一起删
export const clearAmapKey = () => {
	const {amapKey: _, ...rest} = read();
	if (Object.keys(rest).length) writeFileSync(FILE, JSON.stringify(rest, null, 2));
	else if (existsSync(FILE)) unlinkSync(FILE);
};
export const maskKey = (key: string) => (key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '');
