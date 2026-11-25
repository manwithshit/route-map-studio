// 服务端运行时输入校验与路径边界检查
import {existsSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {ASPECTS, DURATION_RANGE, type Aspect, type ComponentToggles, type Landmark, type LngLat, type OutputFps, type Texts, type VideoConfig} from '../src/video/config';
import {THEMES} from '../src/video/themes';

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const validateLngLat = (v: unknown, label = '坐标'): LngLat => {
	if (!Array.isArray(v) || v.length !== 2 || !isFiniteNum(v[0]) || !isFiniteNum(v[1])) {
		throw new ValidationError(`${label}格式无效，需要 [lng, lat] 数值对。`);
	}
	const [lng, lat] = v;
	if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
		throw new ValidationError(`${label}超出有效经纬度范围。`);
	}
	return [lng, lat];
};

export const validateRoutePoints = (raw: unknown): LngLat[] => {
	if (!Array.isArray(raw) || raw.length < 2 || raw.length > 10) {
		throw new ValidationError('算路至少需要 2 个点，最多 10 个点。');
	}
	return raw.map((pt, i) => validateLngLat(pt, `第 ${i + 1} 个路线点`));
};

const reqStr = (v: unknown, label: string, maxLen = 200): string => {
	if (typeof v !== 'string') throw new ValidationError(`${label}必须是字符串。`);
	return v.slice(0, maxLen);
};

const reqBool = (v: unknown, label: string): boolean => {
	if (typeof v !== 'boolean') throw new ValidationError(`${label}必须是布尔值。`);
	return v;
};

export const validateVideoConfig = (raw: unknown): VideoConfig => {
	if (!isObj(raw)) throw new ValidationError('缺少视频配置对象。');

	const theme = reqStr(raw.theme, '主题', 40);
	if (!Object.hasOwn(THEMES, theme)) throw new ValidationError(`不支持的主题：${theme}`);

	const aspect = reqStr(raw.aspect, '画幅', 16) as Aspect;
	if (!Object.hasOwn(ASPECTS, aspect)) throw new ValidationError(`不支持的画幅：${aspect}`);

	if (!isFiniteNum(raw.durationS) || raw.durationS < DURATION_RANGE.min || raw.durationS > DURATION_RANGE.max) {
		throw new ValidationError(`时长必须在 ${DURATION_RANGE.min}–${DURATION_RANGE.max} 秒之间。`);
	}
	if (!isFiniteNum(raw.dynamics) || raw.dynamics < 0 || raw.dynamics > 100) {
		throw new ValidationError('镜头动感必须在 0–100 之间。');
	}

	let fps: OutputFps | undefined;
	if (raw.fps !== undefined) {
		if (raw.fps !== 30 && raw.fps !== 60) throw new ValidationError('帧率只支持 30 或 60。');
		fps = raw.fps;
	}

	if (!isObj(raw.route)) throw new ValidationError('缺少路线数据。');
	if (!Array.isArray(raw.route.coordinates) || raw.route.coordinates.length < 2 || raw.route.coordinates.length > 50_000) {
		throw new ValidationError('路线坐标点数量无效（需 2–50000 个点）。');
	}
	const coordinates = raw.route.coordinates.map((c, i) => validateLngLat(c, `路线点 #${i}`));
	if (!isFiniteNum(raw.route.distanceMeters) || raw.route.distanceMeters <= 0 || raw.route.distanceMeters > 100_000) {
		throw new ValidationError('路线长度必须在 0–100 公里之间。');
	}
	const source = reqStr(raw.route.source, '路线来源', 80);

	if (!Array.isArray(raw.landmarks) || raw.landmarks.length > 20) {
		throw new ValidationError('地标列表无效（最多 20 个）。');
	}
	const landmarks: Landmark[] = raw.landmarks.map((item, i) => {
		if (!isObj(item)) throw new ValidationError(`地标 #${i + 1} 格式无效。`);
		let role: Landmark['role'];
		if (item.role !== undefined) {
			if (item.role !== 'start' && item.role !== 'via' && item.role !== 'end') {
				throw new ValidationError(`地标 #${i + 1} 角色无效。`);
			}
			role = item.role;
		}
		return {
			name: reqStr(item.name, `地标 #${i + 1} 名称`, 80),
			en: reqStr(item.en, `地标 #${i + 1} 英文名`, 120),
			lngLat: validateLngLat(item.lngLat, `地标 #${i + 1} 坐标`),
			...(role ? {role} : {}),
		};
	});

	if (!isObj(raw.texts)) throw new ValidationError('缺少文案配置 texts。');
	const texts: Texts = {
		title1: reqStr(raw.texts.title1, '标题前半', 80),
		title2: reqStr(raw.texts.title2, '标题后半', 80),
		gpsBadge: reqStr(raw.texts.gpsBadge, 'GPS 标签', 60),
		gpsInfo: reqStr(raw.texts.gpsInfo, 'GPS 小字', 80),
		via: reqStr(raw.texts.via, '路线摘要', 200),
	};

	if (!isObj(raw.show)) throw new ValidationError('缺少画面组件开关 show。');
	const show: ComponentToggles = {
		title: reqBool(raw.show.title, 'show.title'),
		gpsBar: reqBool(raw.show.gpsBar, 'show.gpsBar'),
		stepper: reqBool(raw.show.stepper, 'show.stepper'),
		cards: reqBool(raw.show.cards, 'show.cards'),
		mapLabels: reqBool(raw.show.mapLabels, 'show.mapLabels'),
		dashboard: reqBool(raw.show.dashboard, 'show.dashboard'),
		flow: reqBool(raw.show.flow, 'show.flow'),
		summary: reqBool(raw.show.summary, 'show.summary'),
	};

	return {
		theme,
		aspect,
		durationS: raw.durationS,
		dynamics: raw.dynamics,
		fps,
		route: {coordinates, distanceMeters: raw.route.distanceMeters, source},
		landmarks,
		texts,
		show,
	};
};

// 解析尚未完全创建路径的真实祖先路径，防止通过符号链接逃逸目录边界
const resolveRealOrNearest = (target: string): string => {
	const abs = path.resolve(target);
	const tail: string[] = [];
	let cur = abs;
	while (!existsSync(cur)) {
		const parent = path.dirname(cur);
		if (parent === cur) break;
		tail.unshift(path.basename(cur));
		cur = parent;
	}
	const realBase = existsSync(cur) ? realpathSync(cur) : cur;
	return tail.length ? path.join(realBase, ...tail) : realBase;
};

// 严格判断 target 是否位于 baseDir 之内（允许等于 baseDir 仅当 allowEqual=true）
export const isPathInside = (baseDir: string, target: string, allowEqual = false): boolean => {
	const realBase = resolveRealOrNearest(baseDir);
	const realTarget = resolveRealOrNearest(target);
	const rel = path.relative(realBase, realTarget);
	if (rel === '') return allowEqual;
	return !rel.startsWith('..') && !path.isAbsolute(rel);
};
