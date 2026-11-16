// 工作台状态：路线点 + 视频配置。地标和默认文案从路线点推导，用户改过的文案不会被覆盖。
import {sampleConfig, SAMPLES} from '../samples';
import {cleanName, defaultEn} from '../shared/names';
import {DEFAULT_SHOW, DEFAULT_TEXTS, DURATION_RANGE, DYNAMICS_DEFAULT, type Aspect, type ComponentToggles, type LngLat, type Texts, type VideoConfig} from '../video/config';
import type {Place, RouteResult} from './api';

export type PointRole = 'start' | 'via' | 'end';

export type RoutePoint = {
	uid: string;
	role: PointRole;
	place: Place | null;
	landmark: boolean; // 是否弹地标卡
	name: string; // 地标中文名（文案区可改）
	en: string; // 地标英文名（文案区可改）
};

export type WorkbenchState = {
	city: string;
	points: RoutePoint[];
	route: RouteResult | null;
	routeKey: string; // 生成当前路线所用的点坐标，判断是否需要重算
	theme: string;
	aspect: Aspect;
	durationS: number;
	dynamics: number;
	texts: Texts;
	edited: Partial<Record<keyof Texts, boolean>>; // 用户手动改过的文案
	show: ComponentToggles;
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export const emptyPoint = (role: PointRole): RoutePoint => ({uid: uid(), role, place: null, landmark: true, name: '', en: ''});

export const pointFromPlace = (p: RoutePoint, place: Place): RoutePoint => {
	const name = cleanName(place.name);
	return {...p, place, name, en: defaultEn(name)};
};

export const pointsKey = (points: RoutePoint[]) =>
	points
		.filter((p) => p.place)
		.map((p) => p.place!.lngLat.map((v) => v.toFixed(6)).join(','))
		.join(';');

export const isLoop = (points: RoutePoint[]) => {
	const a = points[0]?.place?.lngLat;
	const b = points[points.length - 1]?.place?.lngLat;
	if (!a || !b) return false;
	return Math.hypot((a[0] - b[0]) * 96000, (a[1] - b[1]) * 111000) < 300;
};

export const defaultTexts = (points: RoutePoint[]): Pick<Texts, 'title1' | 'title2' | 'via'> => {
	const named = points.filter((p) => p.place);
	const start = named[0]?.name ?? '';
	const end = named[named.length - 1]?.name ?? '';
	const marks = named.filter((p) => p.landmark).map((p) => p.name);
	if (isLoop(points)) return {title1: `${start}出发，`, title2: '绕一圈回来', via: marks.join(' → ')};
	return {title1: start ? `从${start}，` : '', title2: end ? `到${end}` : '', via: marks.join(' → ')};
};

// 默认文案只覆盖用户没改过的字段
export const withDefaultTexts = (s: WorkbenchState): WorkbenchState => {
	const d = defaultTexts(s.points);
	const texts = {...s.texts};
	(Object.keys(d) as (keyof typeof d)[]).forEach((k) => {
		if (!s.edited[k]) texts[k] = d[k];
	});
	return {...s, texts};
};

export const toVideoConfig = (s: WorkbenchState): VideoConfig | null => {
	if (!s.route) return null;
	return {
		theme: s.theme,
		aspect: s.aspect,
		durationS: s.durationS,
		dynamics: s.dynamics,
		route: {coordinates: s.route.coordinates, distanceMeters: s.route.distanceMeters, source: s.route.source},
		landmarks: s.points.filter((p) => p.place && p.landmark).map((p) => ({name: p.name || cleanName(p.place!.name), en: p.en, lngLat: p.place!.lngLat as LngLat})),
		texts: s.texts,
		show: s.show,
	};
};

export const sampleState = (id: string): WorkbenchState => {
	const sample = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
	const cfg = sampleConfig(sample.id);
	const n = cfg.landmarks.length;
	const points: RoutePoint[] = cfg.landmarks.map((l, i) => ({
		uid: uid(),
		role: i === 0 ? 'start' : i === n - 1 ? 'end' : 'via',
		place: {id: `sample-${i}`, name: l.name, district: sample.city, address: '', lngLat: l.lngLat},
		landmark: true,
		name: l.name,
		en: l.en,
	}));
	return {
		city: sample.city,
		points,
		// 示例路线用调过途经点的固化数据；用户改动路线点后才重新算路
		route: {coordinates: cfg.route.coordinates as LngLat[], distanceMeters: cfg.route.distanceMeters, source: cfg.route.source, roads: []},
		routeKey: pointsKey(points),
		theme: cfg.theme,
		aspect: '9:16',
		durationS: cfg.durationS,
		dynamics: DYNAMICS_DEFAULT,
		texts: {...DEFAULT_TEXTS, ...cfg.texts},
		edited: {title1: true, title2: true},
		show: {...DEFAULT_SHOW},
	};
};

const STORAGE = 'route-map-studio/state/v1';
export const loadState = (): WorkbenchState => {
	try {
		const raw = localStorage.getItem(STORAGE);
		if (raw) {
			const s = JSON.parse(raw) as WorkbenchState;
			if (s.points?.length >= 2 && s.texts && s.show) return {...s, show: {...DEFAULT_SHOW, ...s.show}, durationS: s.durationS ?? DURATION_RANGE.default};
		}
	} catch {
		/* 本地存储不可用时用示例 */
	}
	return sampleState('chengdu');
};
export const saveState = (s: WorkbenchState) => {
	try {
		localStorage.setItem(STORAGE, JSON.stringify(s));
	} catch {
		/* 忽略 */
	}
};
