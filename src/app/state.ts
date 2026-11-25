// 工作台状态：路线点 + 视频配置。地标和默认文案从路线点推导，用户改过的文案不会被覆盖。
import {DEFAULT_THEME, THEMES} from '../video/themes';
import {sampleConfig, SAMPLES} from '../samples';
import {cleanName, defaultEn} from '../shared/names';
import {DEFAULT_SHOW, DEFAULT_TEXTS, DURATION_RANGE, DYNAMICS_DEFAULT, type Aspect, type ComponentToggles, type LngLat, type OutputFps, type Texts, type VideoConfig} from '../video/config';
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
	fps: OutputFps;
	texts: Texts;
	edited: Partial<Record<keyof Texts, boolean>>; // 用户手动改过的文案
	show: ComponentToggles;
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export const emptyPoint = (role: PointRole): RoutePoint => ({uid: uid(), role, place: null, landmark: true, name: '', en: ''});

// 新路线默认只有起点和终点，途经点按需添加
export const clearedRoute = (s: WorkbenchState): WorkbenchState => ({
	...s,
	points: [emptyPoint('start'), emptyPoint('end')],
	route: null,
	routeKey: '',
	edited: {...s.edited, title1: false, title2: false, via: false},
});

export const pointFromPlace =(p: RoutePoint, place: Place): RoutePoint => {
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

// 所有路线点必须在同一个城市。返回第一个冲突的说明；全部同城或城市未知时返回 null
export const cityConflict = (points: RoutePoint[]): string | null => {
	const label = (p: RoutePoint, i: number) => (p.role === 'start' ? '起点' : p.role === 'end' ? '终点' : `途经点 ${i}`);
	let base: {p: RoutePoint; label: string} | null = null;
	let via = 0;
	for (const p of points) {
		if (p.role === 'via') via++;
		const code = p.place?.cityCode;
		if (!code) continue;
		const l = label(p, via);
		if (!base) base = {p, label: l};
		else if (base.p.place!.cityCode !== code) {
			return `${base.label}「${base.p.name}」在${base.p.place!.cityName}，${l}「${p.name}」在${p.place!.cityName}。所有点需要在同一个城市，请把${l}换成${base.p.place!.cityName}的地点。`;
		}
	}
	return null;
};

// 已选点所在城市（排除正在编辑的点），用于在搜索候选里标出其他城市
export const lockedCity = (points: RoutePoint[], exceptUid: string) => {
	const p = points.find((x) => x.uid !== exceptUid && x.place?.cityCode);
	return p ? {code: p.place!.cityCode, name: p.place!.cityName} : null;
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
		fps: s.fps,
		route: {coordinates: s.route.coordinates, distanceMeters: s.route.distanceMeters, source: s.route.source},
		landmarks: s.points
			.filter((p) => p.place && p.landmark)
			.map((p) => ({name: p.name || cleanName(p.place!.name), en: p.en, lngLat: p.place!.lngLat as LngLat, role: p.role})),
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
		place: {id: `sample-${i}`, name: l.name, district: sample.city, address: '', lngLat: l.lngLat, cityCode: sample.cityCode, cityName: `${sample.city}市`},
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
		fps: 60,
		texts: {...DEFAULT_TEXTS, ...cfg.texts},
		edited: {title1: true, title2: true},
		show: {...DEFAULT_SHOW},
	};
};

// 旧版本存下的状态可能有跨城的点（当时没有城市码）和超长路线，载入时清掉，让用户重选
export const sanitize = (s: WorkbenchState): WorkbenchState => {
	const points = s.points.map((p) => (p.place && !p.place.cityCode ? {...p, place: null, name: '', en: ''} : p));
	const dropped = points.some((p, i) => p !== s.points[i]);
	const tooLong = (s.route?.distanceMeters ?? 0) > 80000;
	// 已经下线的风格（如黑金夜景）换成默认风格，否则风格区一个都不选中
	const theme = Object.hasOwn(THEMES, s.theme) ? s.theme : DEFAULT_THEME;
	if (!dropped && !tooLong) return theme === s.theme ? s : {...s, theme};
	return {...s, theme, points, route: null, routeKey: ''};
};

const STORAGE = 'route-map-studio/state/v1';
export const loadState = (): WorkbenchState => {
	try {
		const raw = localStorage.getItem(STORAGE);
		if (raw) {
			const s = JSON.parse(raw) as WorkbenchState;
			if (s.points?.length >= 2 && s.texts && s.show) return sanitize({...s, show: {...DEFAULT_SHOW, ...s.show}, durationS: s.durationS ?? DURATION_RANGE.default, fps: s.fps === 30 ? 30 : 60});
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
