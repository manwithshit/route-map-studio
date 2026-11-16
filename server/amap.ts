// 高德 Web服务：输入提示（边打边补全）。返回坐标已从 GCJ-02 转成 WGS-84。
import {gcjToWgs} from '../src/shared/gcj';
import type {LngLat} from '../src/video/config';

export type Place = {id: string; name: string; district: string; address: string; lngLat: LngLat};

// 常见错误码 → 用户看得懂的说法和改法
const INFOCODE: Record<string, string> = {
	'10001': 'Key 不正确。请确认复制的是完整的 Key。',
	'10003': '这个 Key 今天的调用次数已用完，明天会恢复。',
	'10004': '请求太频繁，稍等几秒再试。',
	'10005': '这个 Key 设置了 IP 白名单，本机不在名单里。到高德控制台把白名单清空或加上本机 IP。',
	'10007': '这个 Key 开启了数字签名。请在高德控制台关闭数字签名，或换一个没开签名的 Key。',
	'10009': 'Key 类型不对：这是「Web端」Key。请在高德控制台新建 Key，服务平台选「Web服务」。',
	'10044': '这个账号今天的调用次数已用完，明天会恢复。',
};

export class AmapError extends Error {
	constructor(
		message: string,
		public infocode: string,
	) {
		super(message);
	}
}

export const inputTips = async (key: string, keywords: string, city: string): Promise<Place[]> => {
	const url = new URL('https://restapi.amap.com/v3/assistant/inputtips');
	url.search = new URLSearchParams({key, keywords, city, citylimit: city ? 'true' : 'false', datatype: 'all'}).toString();
	const res = await fetch(url, {signal: AbortSignal.timeout(10000)});
	if (!res.ok) throw new AmapError(`高德服务暂时不可用（HTTP ${res.status}），稍后再试。`, String(res.status));
	const d = (await res.json()) as {status: string; info: string; infocode: string; tips?: any[]};
	if (d.status !== '1') throw new AmapError(INFOCODE[d.infocode] ?? `高德返回错误：${d.info}（${d.infocode}）`, d.infocode);
	return (d.tips ?? [])
		.filter((t) => typeof t.location === 'string' && t.location.includes(','))
		.map((t) => {
			const [lng, lat] = t.location.split(',').map(Number);
			return {
				id: String(t.id || `${t.name}-${t.location}`),
				name: String(t.name),
				district: typeof t.district === 'string' ? t.district : '',
				address: typeof t.address === 'string' ? t.address : '',
				lngLat: gcjToWgs([lng, lat]),
			};
		});
};

// 保存前验证 Key：用一个必定有结果的词查一次
export const testKey = async (key: string) => {
	await inputTips(key, '人民公园', '');
};
