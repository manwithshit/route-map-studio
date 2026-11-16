// 算路：OSRM 骑行路网（routing.openstreetmap.de），与 OpenStreetMap 底图同源，路线贴合道路中线。
// 用骑行而不是驾车：驾车受单行道影响常绕远并出现掉头（成都示例里 13.3km 对 10.3km）。
import type {LngLat} from '../src/video/config';

export type RouteResult = {coordinates: LngLat[]; distanceMeters: number; source: string; roads: string[]};

export const fetchRoute = async (points: LngLat[]): Promise<RouteResult> => {
	if (points.length < 2) throw new Error('至少需要起点和终点。');
	const coords = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
	const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
	const res = await fetch(url, {signal: AbortSignal.timeout(30000)});
	if (!res.ok) throw new Error(`算路服务暂时不可用（HTTP ${res.status}），稍后再试。`);
	const d = (await res.json()) as any;
	if (d.code !== 'Ok' || !d.routes?.length) {
		throw new Error(d.code === 'NoRoute' ? '这几个点之间找不到可走的路，换一个位置试试。' : `算路失败：${d.message ?? d.code}`);
	}
	const r = d.routes[0];
	return {
		coordinates: r.geometry.coordinates,
		distanceMeters: Math.round(r.distance),
		source: 'OSRM bike profile @ routing.openstreetmap.de, data © OpenStreetMap contributors',
		roads: [...new Set<string>(r.legs.flatMap((l: any) => l.steps.filter((s: any) => s.distance > 60 && s.name).map((s: any) => s.name)))],
	};
};
