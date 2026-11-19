// 单一事实来源：给定配置和帧号，纯函数算出相机、轨迹、车头、流光、地标和 HUD 数值。
// 地图层和 HUD 都只读这里，同一帧的数据完全一致，不存在“画面先走、轨迹后追”。
import * as turf from '@turf/turf';
import {Easing} from 'remotion';
import {FPS, type LabelAnchor, type LngLat, type VideoConfig} from './config';
import {getLayout, type Layout} from './layout';

type LineFeature = ReturnType<typeof turf.lineString>;
type LineCollection = ReturnType<typeof turf.featureCollection<LineFeature['geometry']>>;
type PointCollection = ReturnType<typeof turf.featureCollection<ReturnType<typeof turf.point>['geometry']>>;

export type Stop = {
	name: string;
	en: string;
	lngLat: LngLat;
	km: number;
	reachFrame: number;
	anchor: LabelAnchor;
};

export type CameraState = {
	center: LngLat;
	zoom: number;
	pitch: number;
	bearing: number;
	padding: {top: number; bottom: number; left: number; right: number};
};

export type FrameState = {
	t: number;
	progress: number;
	km: number;
	head: LngLat;
	camera: CameraState;
	trace: LineFeature;
	flow: LineCollection;
	headFc: PointCollection;
	stopsFc: PointCollection;
	speedKmh: number;
	tripSeconds: number;
	activeStop: number; // 最近一个已到达地标的序号，-1 表示尚无
	summary: number; // 结尾总结卡出现进度 0–1
};

export type Timeline = ReturnType<typeof buildTimeline>;

// 片头 0.55s 起步，收尾拉高约 1.7s，再停留约 1.2s：穿行时长 = 总时长 - 3.45s
export const TRAVEL_OVERHEAD_S = 3.45;
const RAMP_IN = 0.18;
const RAMP_OUT = 0.2;
const AVG_SPEED_KMH = 36; // 模拟行车均速，用于 HUD 车速与行程时间
const PULSE_PERIOD_S = 1.1;
const FLOW_PERIOD_S = 1.6; // 流光走完已行进轨迹一次的时长
const TRAVEL_PITCH = 58;
const FINAL_PITCH = 32;
const LABEL_FADE = 18;
const CARD_LEAD = 0.12; // 起点卡片出现时刻（秒）

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrap180 = (d: number) => ((d + 540) % 360) - 180;
const smoothstep = (x: number) => x * x * (3 - 2 * x);
const introEase = Easing.bezier(0.5, 0, 0.15, 1);
const pullEase = Easing.inOut(Easing.cubic);
const burstEase = Easing.out(Easing.cubic);

// 帧域高斯平滑（按里程平滑不够：巡航约 2km/s，路口在 0.3s 内就过完）
export const gaussSmooth = (xs: number[], sigma: number) => {
	const r = Math.ceil(sigma * 3);
	const w = Array.from({length: 2 * r + 1}, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
	return xs.map((_, i) => {
		let s = 0;
		let sw = 0;
		for (let k = -r; k <= r; k++) {
			const j = Math.min(xs.length - 1, Math.max(0, i + k));
			s += xs[j] * w[k + r];
			sw += w[k + r];
		}
		return s / sw;
	});
};

// 镜头动感 0–100 → 偏航跟随比例、偏航平滑强度、穿行缩放。50 对应已验证过的成片参数。
export const dynamicsParams = (dynamics: number) => {
	const s = clamp01(dynamics / 100);
	return {
		yawFollow: 0.1 + 0.7 * s,
		bearingSigma: 16 * (1.5 - s),
		travelZoom: 14.8 + 0.4 * (s - 0.5),
	};
};

// 起终点离得很近（环线）时，起点→终点方向没有意义，改用正北朝上
export const baseBearingFor = (coords: LngLat[], cosLat: number) => {
	const start = coords[0];
	const end = coords[coords.length - 1];
	const m = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 111320 * cosLat, (a[1] - b[1]) * 111320);
	let far = 0;
	for (const c of coords) far = Math.max(far, m(start, c));
	if (m(start, end) < far * 0.35) return 0;
	return turf.bearing(turf.point(start), turf.point(end));
};

// 地图站名方位：在收尾全景的朝向下，找最近的邻居，把文字放到背离邻居的一侧
export const autoAnchors = (pts: LngLat[], bearingDeg: number, cosLat: number, spanM: number): LabelAnchor[] => {
	const b = (bearingDeg * Math.PI) / 180;
	const xy = pts.map(([lng, lat]) => {
		const e = lng * 111320 * cosLat;
		const n = lat * 111320;
		return {x: e * Math.cos(b) - n * Math.sin(b), y: e * Math.sin(b) + n * Math.cos(b)};
	});
	return xy.map((p, i) => {
		let best = -1;
		let bd = Infinity;
		xy.forEach((q, j) => {
			if (j === i) return;
			const d = Math.hypot(q.x - p.x, q.y - p.y);
			if (d < bd) {
				bd = d;
				best = j;
			}
		});
		if (best < 0 || bd > spanM * 0.3) return 'bottom';
		const dx = xy[best].x - p.x;
		const dy = xy[best].y - p.y;
		if (Math.abs(dy) > Math.abs(dx)) return dx >= 0 ? 'right' : 'left'; // 邻居在上下方：文字放左右
		return dy >= 0 ? 'top' : 'bottom'; // 邻居在左右方：邻居偏上则文字放下方
	});
};

const buildTimeline = (cfg: VideoConfig) => {
	const L: Layout = getLayout(cfg.aspect);
	const coords = cfg.route.coordinates as LngLat[];
	const route = turf.lineString(coords);
	const ROUTE_KM = turf.length(route);
	const START = coords[0];
	const meanLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
	const COS_LAT = Math.cos((meanLat * Math.PI) / 180);
	const DURATION_FRAMES = Math.round(FPS * cfg.durationS);
	const dyn = dynamicsParams(cfg.dynamics);
	const travelSeconds = Math.max(2, cfg.durationS - TRAVEL_OVERHEAD_S);

	const T = {
		introEnd: 1.05,
		travelStart: 0.55,
		travelEnd: 0.55 + travelSeconds,
		pullStart: 0.15 + travelSeconds,
		pullEnd: 1.85 + travelSeconds,
	};

	// 梯形速度曲线：sin² 平滑加速 → 匀速巡航 → sin² 平滑减速。
	// 位移是速度的解析积分，逐帧步进均匀，没有跳变。
	const rampArea = (x: number) => x / 2 - Math.sin(Math.PI * x) / (2 * Math.PI);
	const PROFILE_AREA = 1 - RAMP_IN / 2 - RAMP_OUT / 2;
	const travelU = (t: number) => clamp01((t - T.travelStart) / (T.travelEnd - T.travelStart));
	const travelProgress = (t: number) => {
		const u = travelU(t);
		let area: number;
		if (u < RAMP_IN) {
			area = RAMP_IN * rampArea(u / RAMP_IN);
		} else if (u <= 1 - RAMP_OUT) {
			area = RAMP_IN / 2 + (u - RAMP_IN);
		} else {
			const x = (u - (1 - RAMP_OUT)) / RAMP_OUT;
			area = RAMP_IN / 2 + (1 - RAMP_IN - RAMP_OUT) + RAMP_OUT * (0.5 - rampArea(1 - x));
		}
		return area / PROFILE_AREA;
	};
	const travelVelocity = (t: number) => {
		const u = travelU(t);
		if (t <= T.travelStart || t >= T.travelEnd) return 0;
		let v = 1;
		if (u < RAMP_IN) v = Math.sin((Math.PI / 2) * (u / RAMP_IN)) ** 2;
		else if (u > 1 - RAMP_OUT) v = Math.sin((Math.PI / 2) * ((1 - u) / RAMP_OUT)) ** 2;
		return v / PROFILE_AREA; // 相对均速的倍数
	};
	const along = (km: number) => turf.along(route, Math.min(ROUTE_KM, Math.max(0, km))).geometry.coordinates as LngLat;

	// 平滑航向：前后约 ±0.5km 的路段方向向量做三角加权平均
	const smoothHeading = (km: number) => {
		let sx = 0;
		let sy = 0;
		for (let k = -8; k <= 8; k++) {
			const a = along(km + k * 0.06 - 0.03);
			const b = along(km + k * 0.06 + 0.03);
			const w = 1 - Math.abs(k) / 9;
			sx += (b[0] - a[0]) * COS_LAT * w;
			sy += (b[1] - a[1]) * w;
		}
		return (Math.atan2(sx, sy) * 180) / Math.PI;
	};
	const BASE_BEARING = baseBearingFor(coords, COS_LAT);

	// 相机轨迹：预计算每帧原始值 → 帧域高斯卷积。镜头走圆弧，车头在拐角处轻微偏离中心，但画面不甩。
	const CAM_PATH = (() => {
		const kms = Array.from({length: DURATION_FRAMES}, (_, f) => travelProgress(f / FPS) * ROUTE_KM);
		const pts = kms.map(along);
		let prev = 0;
		const yaw = kms.map((km) => {
			// 展开角度，避免 ±180 跳变参与平均
			const d = wrap180(smoothHeading(km) - BASE_BEARING);
			prev = prev + wrap180(d - prev);
			return BASE_BEARING + dyn.yawFollow * prev;
		});
		return {
			lng: gaussSmooth(pts.map((p) => p[0]), 7),
			lat: gaussSmooth(pts.map((p) => p[1]), 7),
			bearing: gaussSmooth(gaussSmooth(yaw, dyn.bearingSigma), dyn.bearingSigma),
		};
	})();

	// Q 版小车的车头朝向：看前后约 120m 的路段，再在帧域里平滑约 0.25 秒，路口转弯是一段弧，不跳
	const HEAD_YAW = (() => {
		let prev = 0;
		const raw = Array.from({length: DURATION_FRAMES}, (_, f) => {
			const km = travelProgress(f / FPS) * ROUTE_KM;
			const a = along(km - 0.06);
			const b = along(km + 0.06);
			const h = (Math.atan2((b[0] - a[0]) * COS_LAT, b[1] - a[1]) * 180) / Math.PI;
			prev = prev + wrap180(h - prev);
			return prev;
		});
		return gaussSmooth(raw, 8);
	})();

	// 收尾全景：按 BASE_BEARING 旋转后的包围盒，放进安全区内的取景框
	const {fitCamera, spanM} = (() => {
		const b = (BASE_BEARING * Math.PI) / 180;
		const M = 111320;
		const pts = coords.map(([lng, lat]) => {
			const e = (lng - START[0]) * M * COS_LAT;
			const n = (lat - START[1]) * M;
			return {up: e * Math.sin(b) + n * Math.cos(b), right: e * Math.cos(b) - n * Math.sin(b)};
		});
		const ups = pts.map((p) => p.up);
		const rights = pts.map((p) => p.right);
		const [u0, u1, r0, r1] = [Math.min(...ups), Math.max(...ups), Math.min(...rights), Math.max(...rights)];
		const boxW = L.width - L.fit.left - L.fit.right;
		const boxH = (L.height - L.fit.top - L.fit.bottom) * Math.cos((FINAL_PITCH * Math.PI) / 180);
		const mPerPx = Math.max((r1 - r0) / boxW, (u1 - u0) / boxH, 0.5);
		const zoom = Math.log2((78271.517 * COS_LAT) / mPerPx) - 0.08;
		const uc = (u0 + u1) / 2;
		const rc = (r0 + r1) / 2;
		const e = uc * Math.sin(b) + rc * Math.cos(b);
		const n = uc * Math.cos(b) - rc * Math.sin(b);
		const center: LngLat = [START[0] + e / (M * COS_LAT), START[1] + n / M];
		return {fitCamera: {center, zoom}, spanM: Math.hypot(u1 - u0, r1 - r0)};
	})();

	const snapped = cfg.landmarks.map((s) => {
		const p = turf.nearestPointOnLine(route, turf.point(s.lngLat));
		return {s, km: p.properties.location ?? 0, lngLat: p.geometry.coordinates as LngLat};
	});
	snapped.sort((a, b) => a.km - b.km);
	const anchors = autoAnchors(
		snapped.map((x) => x.lngLat),
		BASE_BEARING,
		COS_LAT,
		spanM,
	);
	const STOPS: Stop[] = snapped.map((x, i) => {
		let reachFrame = 0;
		while (reachFrame < DURATION_FRAMES - 1 && travelProgress(reachFrame / FPS) * ROUTE_KM < x.km - 0.005) {
			reachFrame++;
		}
		return {name: x.s.name, en: x.s.en, lngLat: x.lngLat, km: x.km, reachFrame, anchor: anchors[i]};
	});
	if (STOPS.length > 0 && STOPS[0].km < 0.05) STOPS[0].reachFrame = Math.round(CARD_LEAD * FPS); // 起点卡片随片头出现

	const summaryStart = Math.round((T.pullEnd - 0.35) * FPS);

	// 流光：一段亮光从起点沿已行进轨迹跑到车头，循环往复；长度随全程按比例取
	const FLOW_LEN = Math.max(0.25, ROUTE_KM * 0.05);
	const flowAt = (t: number, km: number) => {
		const lines: LineFeature[] = [];
		if (!cfg.show.flow || km < FLOW_LEN * 0.6) return turf.featureCollection(lines);
		for (const offset of [0, 0.5]) {
			const p = ((((t - T.travelStart) / FLOW_PERIOD_S + offset) % 1) + 1) % 1;
			const end = p * (km + FLOW_LEN * 0.5);
			const a = Math.max(0, end - FLOW_LEN);
			const b = Math.min(km, end);
			if (b - a > 0.02) lines.push(turf.lineSliceAlong(route, a, b) as LineFeature);
		}
		return turf.featureCollection(lines);
	};

	const getFrameState = (frame: number): FrameState => {
		const t = frame / FPS;
		const progress = travelProgress(t);
		const km = progress * ROUTE_KM;
		const head = along(km);

		const ik = introEase(clamp01(t / T.introEnd));
		const pk = pullEase(clamp01((t - T.pullStart) / (T.pullEnd - T.pullStart)));

		const fi = Math.min(DURATION_FRAMES - 1, Math.max(0, frame));
		const chase = CAM_PATH.bearing[fi];
		const bearing = lerp(lerp(BASE_BEARING - 55, chase, ik), BASE_BEARING, pk);
		const zoom = lerp(lerp(dyn.travelZoom - 1, dyn.travelZoom, ik), fitCamera.zoom, pk);
		const pitch = lerp(lerp(18, TRAVEL_PITCH, ik), FINAL_PITCH, pk);
		const cam: LngLat = [CAM_PATH.lng[fi], CAM_PATH.lat[fi]];
		const center: LngLat = [lerp(cam[0], fitCamera.center[0], pk), lerp(cam[1], fitCamera.center[1], pk)];
		const padding = {
			top: lerp(L.travel.top, L.fit.top, pk),
			bottom: lerp(0, L.fit.bottom, pk),
			left: lerp(L.travel.left, L.fit.left, pk),
			right: lerp(0, L.fit.right, pk),
		};

		const trace = turf.lineSliceAlong(route, 0, Math.max(0.001, km)) as LineFeature;

		// 车头呼吸波纹：两圈错相位，半径与透明度都由帧号决定
		const phase = (t / PULSE_PERIOD_S) % 1;
		const ring = (p: number) => ({rr: 16 + 54 * p, ro: 0.75 * (1 - p) ** 1.6});
		const headFc = turf.featureCollection([
			turf.point(head, {kind: 'ring', ...ring(phase)}),
			turf.point(head, {kind: 'ring', ...ring((phase + 0.5) % 1)}),
			turf.point(head, {kind: 'core', rr: 0, ro: 1, hd: HEAD_YAW[fi]}),
		]) as PointCollection;

		let activeStop = -1;
		STOPS.forEach((st, i) => {
			if (frame >= st.reachFrame) activeStop = i;
		});
		// 地图站名：穿行时只显示下一站（相邻地标近、镜头会转向，全显示会叠字）；
		// 刚到达的站文字淡出；拉高后段（镜头基本转回基准朝向）所有站一起淡入。
		const allIn = smoothstep(clamp01((pk - 0.6) / 0.35));
		const stopsFc = turf.featureCollection(
			STOPS.map((s, i) => {
				const since = (frame - s.reachFrame) / FPS;
				const reached = since >= 0;
				const burst = reached ? clamp01(since / 0.9) : 1;
				let lo = 0;
				if (i === activeStop + 1) lo = activeStop < 0 ? 1 : clamp01((frame - STOPS[activeStop].reachFrame) / LABEL_FADE);
				else if (i === activeStop) lo = 1 - clamp01((frame - s.reachFrame) / LABEL_FADE);
				lo = cfg.show.mapLabels ? Math.max(lo, allIn) : 0;
				return turf.point(s.lngLat, {
					name: s.name,
					anchor: s.anchor,
					lit: reached ? 1 : 0,
					lo,
					br: 10 + 80 * burstEase(burst),
					bo: reached ? 0.9 * (1 - burst) : 0,
				});
			}),
		) as PointCollection;

		return {
			t,
			progress,
			km,
			head,
			camera: {center, zoom, pitch, bearing, padding},
			trace,
			flow: flowAt(t, km) as LineCollection,
			headFc,
			stopsFc,
			speedKmh: AVG_SPEED_KMH * travelVelocity(t),
			tripSeconds: (km / AVG_SPEED_KMH) * 3600,
			activeStop,
			summary: clamp01((frame - summaryStart) / (0.5 * FPS)),
		};
	};

	return {
		cfg,
		layout: L,
		route,
		ROUTE_KM,
		STOPS,
		DURATION_FRAMES,
		summaryStart,
		travelSeconds,
		tripSecondsTotal: (ROUTE_KM / AVG_SPEED_KMH) * 3600,
		getFrameState,
	};
};

// 按配置内容缓存，避免 Player 每帧重建
const cache = new Map<string, Timeline>();
export const getTimeline = (cfg: VideoConfig): Timeline => {
	const key = JSON.stringify([
		cfg.aspect,
		cfg.durationS,
		cfg.dynamics,
		cfg.route.coordinates.length,
		cfg.route.coordinates[0],
		cfg.route.coordinates[cfg.route.coordinates.length - 1],
		cfg.route.distanceMeters,
		cfg.landmarks,
		cfg.show.flow,
		cfg.show.mapLabels,
	]);
	let tl = cache.get(key);
	if (!tl) {
		if (cache.size > 20) cache.clear();
		tl = buildTimeline(cfg);
		cache.set(key, tl);
	}
	return tl;
};
