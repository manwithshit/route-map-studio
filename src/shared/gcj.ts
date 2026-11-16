// 高德返回 GCJ-02 坐标，底图（OpenStreetMap）是 WGS-84，直接叠会偏约 300–500m。
// 这里用公开的 GCJ-02 正算公式迭代反解到 WGS-84，误差在 1m 以内。
import type {LngLat} from '../video/config';

const A = 6378245.0;
const EE = 0.00669342162296594323;

const outOfChina = ([lng, lat]: LngLat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

const tLat = (x: number, y: number) => {
	let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
	r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
	r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
	return r;
};
const tLng = (x: number, y: number) => {
	let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
	r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
	r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
	return r;
};

export const wgsToGcj = (p: LngLat): LngLat => {
	if (outOfChina(p)) return p;
	const [lng, lat] = p;
	let dLat = tLat(lng - 105, lat - 35);
	let dLng = tLng(lng - 105, lat - 35);
	const radLat = (lat / 180) * Math.PI;
	let magic = Math.sin(radLat);
	magic = 1 - EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
	dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
	return [lng + dLng, lat + dLat];
};

export const gcjToWgs = (p: LngLat): LngLat => {
	if (outOfChina(p)) return p;
	let w: LngLat = [p[0], p[1]];
	for (let i = 0; i < 6; i++) {
		const g = wgsToGcj(w);
		w = [w[0] - (g[0] - p[0]), w[1] - (g[1] - p[1])];
	}
	return w;
};
