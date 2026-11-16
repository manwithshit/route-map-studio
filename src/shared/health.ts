// 路线体检：把手工踩过的坑变成自动提示。只读路线几何和配置，不联网。
import type {LngLat} from '../video/config';
import {TRAVEL_OVERHEAD_S} from '../video/timeline';

export type Issue = {level: 'error' | 'warn'; code: string; message: string};

const metersBetween = (a: LngLat, b: LngLat) => {
	const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
	return Math.hypot((a[0] - b[0]) * 111320 * cos, (a[1] - b[1]) * 111320);
};

// 按 10m 加密，找“沿路相隔 >300m 却在空间上 <25m”的点对，估算折返重叠长度（米）
export const overlapMeters = (coords: LngLat[]) => {
	const pts: LngLat[] = [];
	for (let i = 0; i < coords.length - 1; i++) {
		const n = Math.max(1, Math.floor(metersBetween(coords[i], coords[i + 1]) / 10));
		for (let k = 0; k < n; k++) {
			pts.push([coords[i][0] + ((coords[i + 1][0] - coords[i][0]) * k) / n, coords[i][1] + ((coords[i + 1][1] - coords[i][1]) * k) / n]);
		}
	}
	const s = [0];
	for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + metersBetween(pts[i - 1], pts[i]));
	const hit = new Set<number>();
	for (let i = 0; i < pts.length; i += 3) {
		for (let j = i + 1; j < pts.length; j += 3) {
			if (s[j] - s[i] > 300 && metersBetween(pts[i], pts[j]) < 25) hit.add(j);
		}
	}
	return hit.size * 30;
};

export const checkRoute = (opts: {coordinates: LngLat[]; distanceMeters: number; durationS: number; landmarks: {name: string; lngLat: LngLat}[]}): Issue[] => {
	const issues: Issue[] = [];
	const km = opts.distanceMeters / 1000;
	if (km < 0.5) issues.push({level: 'error', code: 'too-short', message: `路线只有 ${Math.round(opts.distanceMeters)} 米，太短了，镜头没有可走的路。换一个更远的终点。`});
	if (km > 80) issues.push({level: 'error', code: 'too-long', message: `路线 ${km.toFixed(0)} 公里，超出城市级动画的范围（上限 80 公里）。`});

	const travel = Math.max(2, opts.durationS - TRAVEL_OVERHEAD_S);
	const kmPerS = km / travel;
	if (kmPerS > 3.2) {
		const need = Math.ceil((km / 3.2 + TRAVEL_OVERHEAD_S) * 2) / 2;
		issues.push({level: 'warn', code: 'too-fast', message: `路线较长，车头每秒要走 ${kmPerS.toFixed(1)} 公里，画面会很快。建议把时长调到 ${need} 秒以上。`});
	} else if (kmPerS < 0.25 && km >= 0.5) {
		issues.push({level: 'warn', code: 'too-slow', message: '路线很短，车头走得很慢。可以缩短时长，或者把终点放远一些。'});
	}

	const ov = overlapMeters(opts.coordinates);
	if (ov > 300) issues.push({level: 'warn', code: 'overlap', message: `路线有约 ${ov} 米来回重叠（常见原因：途经点落在支路或单行道上，导致过去再折返）。把途经点换成主路上的位置通常能解决。`});

	for (let i = 0; i < opts.landmarks.length - 1; i++) {
		const a = opts.landmarks[i];
		const b = opts.landmarks[i + 1];
		const d = metersBetween(a.lngLat, b.lngLat);
		if (d < 150) issues.push({level: 'warn', code: 'too-close', message: `「${a.name}」和「${b.name}」只相距 ${Math.round(d)} 米，两张地标卡会接连弹出。可以关掉其中一个的地标。`});
	}
	return issues;
};
