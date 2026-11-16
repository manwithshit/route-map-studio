import type {LngLat, VideoConfig} from '../video/config';

export type Place = {id: string; name: string; district: string; address: string; lngLat: LngLat; cityCode: string; cityName: string};
export type RouteResult = {coordinates: LngLat[]; distanceMeters: number; source: string; roads: string[]};
export type Job = {id: string; status: 'bundling' | 'rendering' | 'done' | 'error'; progress: number; output?: string; error?: string};

const call = async <T,>(url: string, init?: RequestInit): Promise<T> => {
	const res = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...init});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
	return data as T;
};

export const api = {
	config: () => call<{hasKey: boolean; keyMasked: string; outputDir: string}>('/api/config'),
	saveKey: (key: string) => call<{ok: true; keyMasked: string}>('/api/key', {method: 'POST', body: JSON.stringify({key})}),
	search: (q: string, city: string, signal?: AbortSignal) =>
		call<{places: Place[]}>(`/api/search?${new URLSearchParams({q, city})}`, {signal}).then((d) => d.places),
	route: (points: LngLat[]) => call<RouteResult>('/api/route', {method: 'POST', body: JSON.stringify({points})}),
	render: (config: VideoConfig) => call<Job>('/api/render', {method: 'POST', body: JSON.stringify({config})}),
	job: (id: string) => call<Job>(`/api/render/${id}`),
	reveal: (path: string) => call<{ok: true}>('/api/reveal', {method: 'POST', body: JSON.stringify({path})}),
};
