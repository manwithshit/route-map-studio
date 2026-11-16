// 算路：OSRM 骑行路网（routing.openstreetmap.de），与 OpenStreetMap 底图同源，路线贴合道路中线。
// 用骑行而不是驾车：驾车受单行道影响常绕远并出现掉头（成都示例里 13.3km 对 10.3km）。
import type {LngLat} from '../src/video/config';

export type RouteResult = {coordinates: LngLat[]; distanceMeters: number; source: string; roads: string[]};

const MAX_KM = 80; // 与 src/shared/health.ts 的上限一致

const kmBetween = (a: LngLat, b: LngLat) => {
	const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
	return Math.hypot((a[0] - b[0]) * 111.32 * cos, (a[1] - b[1]) * 111.32);
};

export const fetchRoute = async (points: LngLat[]): Promise<RouteResult> => {
	if (points.length < 2) throw new Error('至少需要起点和终点。');
	// 跨城的超长路线有上万个坐标点，传到浏览器会把预览拖死，所以算路前后都拦一次
	for (let i = 1; i < points.length; i++) {
		if (kmBetween(points[0], points[i]) > MAX_KM) throw new Error(`路线点之间超过 ${MAX_KM} 公里，所有点需要在同一个城市。`);
	}
	const coords = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
	const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
	const res = await fetch(url, {signal: AbortSignal.timeout(30000)});
	if (!res.ok) throw new Error(`算路服务暂时不可用（HTTP ${res.status}），稍后再试。`);
	const d = (await res.json()) as any;
	if (d.code !== 'Ok' || !d.routes?.length) {
		throw new Error(d.code === 'NoRoute' ? '这几个点之间找不到可走的路，换一个位置试试。' : `算路失败：${d.message ?? d.code}`);
	}
	const r = d.routes[0];
	if (r.distance > MAX_KM * 1000) throw new Error(`路线 ${Math.round(r.distance / 1000)} 公里，超出城市级动画的范围（上限 ${MAX_KM} 公里）。`);
	return {
		coordinates: r.geometry.coordinates,
		distanceMeters: Math.round(r.distance),
		source: 'OSRM bike profile @ routing.openstreetmap.de, data © OpenStreetMap contributors',
		roads: [...new Set<string>(r.legs.flatMap((l: any) => l.steps.filter((s: any) => s.distance > 60 && s.name).map((s: any) => s.name)))],
	};
};
