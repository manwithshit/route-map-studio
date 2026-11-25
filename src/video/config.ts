// 视频配置：工作台编辑的就是这个对象，预览（Player）和渲染（renderer）都只吃它。
// 坐标一律 WGS-84 [lng, lat]，与 OpenStreetMap 底图一致。

export type LngLat = [number, number];
export type Aspect = '9:16' | '3:4' | '16:9';
export type LabelAnchor = 'bottom' | 'top' | 'left' | 'right';

export type Landmark = {
	name: string; // 地标卡与地图上的中文名
	en: string; // 地标卡英文名
	lngLat: LngLat;
	role?: 'start' | 'via' | 'end'; // 可选：区分起终点与途经点，避免重复经过同坐标时终点错位
};

export type ComponentToggles = {
	title: boolean; // 顶部大标题
	gpsBar: boolean; // 顶栏 GPS 小字
	stepper: boolean; // 站点进度条
	cards: boolean; // 地标卡
	mapLabels: boolean; // 地图上的站名
	dashboard: boolean; // 底部仪表盘
	flow: boolean; // 轨迹流光
	summary: boolean; // 结尾总结卡
};

export type Texts = {
	title1: string; // 标题前半（白字）
	title2: string; // 标题后半（强调色）
	gpsBadge: string;
	gpsInfo: string;
	via: string; // 结尾总结卡的路线摘要
};

export type VideoConfig = {
	theme: string;
	aspect: Aspect;
	durationS: number;
	dynamics: number; // 镜头动感 0–100
	route: {
		coordinates: number[][];
		distanceMeters: number;
		source: string;
	};
	landmarks: Landmark[]; // 按行进顺序；只包含“弹地标”的点
	texts: Texts;
	show: ComponentToggles;
	fps?: OutputFps; // 成片帧率，默认 60
};

export type OutputFps = 30 | 60;

export const ASPECTS: Record<Aspect, {width: number; height: number; label: string}> = {
	'9:16': {width: 1080, height: 1920, label: '9:16 竖屏'},
	'3:4': {width: 1080, height: 1440, label: '3:4 竖图'},
	'16:9': {width: 1920, height: 1080, label: '16:9 横屏'},
};

export const DURATION_RANGE = {min: 6, max: 14, step: 0.5, default: 8.5};
export const DYNAMICS_DEFAULT = 50;
// 时间轴固定按 60 帧算（镜头平滑、动画节奏都按它调过）。出 30fps 时隔一帧取一帧，画面节奏不变。
export const FPS = 60;
export const outFps = (c: Pick<VideoConfig, 'fps'>): OutputFps => (c.fps === 30 ? 30 : 60);

export const DEFAULT_SHOW: ComponentToggles = {
	title: true,
	gpsBar: true,
	stepper: true,
	cards: true,
	mapLabels: true,
	dashboard: true,
	flow: true,
	summary: true,
};

export const DEFAULT_TEXTS: Texts = {
	title1: '',
	title2: '',
	gpsBadge: 'GPS TRACKING',
	gpsInfo: 'SAT 12 · ±3m',
	via: '',
};

export const durationFrames = (c: Pick<VideoConfig, 'durationS' | 'fps'>) => Math.round(outFps(c) * c.durationS);
