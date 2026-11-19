// 视觉主题：底图配色 + 轨迹 + HUD 强调色。渲染时用 --props='{"theme":"neon"}' 切换。
// 颜色里写成 'r,g,b' 的字段用于拼 rgba() 透明度。

export type Theme = {
	id: string;
	label: string;
	desc: string;
	bg: string;
	bgRgb: string;
	accent: string; // 轨迹主色 / HUD 强调色
	head: string; // 车头波纹色
	halo: string; // 轨迹最外层光晕
	trace: [string, string, string, string]; // 轨迹渐变：尾 → 中 → 近头 → 头
	ink: string; // HUD 次要文字
	glass: [string, string];
	residential: string;
	green: string;
	water: string;
	waterEdge: string;
	waterway: string;
	roadMinor: string;
	roadMajor: string;
	roadGlow: string;
	highway: string;
	rail: string;
	building: [string, string, string]; // 按楼高 0 / 60 / 180m 取色
	buildingOpacity: number;
	buildingOutline?: string; // 楼块地面描边（线框感）
	grid?: string; // 地面透视网格
	stopIdle: string;
	sky: {sky: string; horizon: string; fog: string};
	light: string;
	// ── 以下是可选的画法开关。不填就是前 6 套的霓虹发光画法 ──
	flat?: boolean; // 不画任何发光：轨迹、道路、HUD 都去掉光晕
	text?: string; // HUD 主文字色，默认白色；浅色底图要换深色
	shadow?: string; // HUD 卡片投影
	vignette?: number; // 四角压暗强度，默认 0.55
	paper?: boolean; // 画面叠一层纸张纹理
	lightIntensity?: number; // 楼块光照强度，默认 0.32
	roadCase?: string; // 主干道描边色：有它就画描边，不画道路光晕
	traceCase?: string; // 轨迹描边色，也用作未走路段的虚线色
	headIcon?: 'car'; // 车头换成 Q 版小车，车头朝向跟着路走
	buildingScale?: number; // 楼高倍率，默认 1
	terrain?: {
		exaggeration: number; // 地形高度放大倍数
		shadow: string; // 山体阴影色
		highlight: string; // 山体受光色
		relief: [number, string][]; // 按海拔（米）着色
	};
};

export const THEMES: Record<string, Theme> = {
	cyan: {
		id: 'cyan',
		label: '暗夜青',
		desc: '当前版本。深蓝黑底、荧光青轨迹，稳妥的科技感。',
		bg: '#03060c',
		bgRgb: '3,6,12',
		accent: '#00f2fe',
		head: '#00f2fe',
		halo: '#0090ff',
		trace: ['rgba(0,150,255,0.55)', '#00d4ff', '#00f2fe', '#e8ffff'],
		ink: '200,230,255',
		glass: ['14,30,52', '6,12,24'],
		residential: '#070c16',
		green: '#06150f',
		water: '#06192c',
		waterEdge: '#11466e',
		waterway: '#0d3556',
		roadMinor: '#152236',
		roadMajor: '#21405f',
		roadGlow: '#0e2a46',
		highway: '#2c5a83',
		rail: '#1b2a3e',
		building: ['#0a1424', '#10233d', '#17375c'],
		buildingOpacity: 0.88,
		stopIdle: '#0b2236',
		sky: {sky: '#020409', horizon: '#0a2236', fog: '#050b16'},
		light: '#9fe6ff',
	},
	neon: {
		id: 'neon',
		label: '赛博霓虹',
		desc: '紫黑底、品红轨迹配青色车头和高架，地面带合成器浪潮网格。',
		bg: '#07030f',
		bgRgb: '7,3,15',
		accent: '#ff2bd6',
		head: '#00f0ff',
		halo: '#8a2bff',
		trace: ['rgba(120,40,255,0.6)', '#b04bff', '#ff2bd6', '#ffe6fb'],
		ink: '230,205,255',
		glass: ['36,14,58', '12,6,24'],
		residential: '#0d0619',
		green: '#0a0a1c',
		water: '#0a0b2e',
		waterEdge: '#3b2a9a',
		waterway: '#251a70',
		roadMinor: '#1d1036',
		roadMajor: '#5a1f78',
		roadGlow: '#3a0f55',
		highway: '#00b8d4',
		rail: '#2a1846',
		building: ['#120a22', '#26103f', '#46176a'],
		buildingOpacity: 0.9,
		grid: '#2c1450',
		stopIdle: '#1d0b33',
		sky: {sky: '#05020b', horizon: '#3a0f55', fog: '#0d0519'},
		light: '#e0a8ff',
	},
	gold: {
		id: 'gold',
		label: '黑金夜景',
		desc: '纯黑底、暖金轨迹，楼越高越亮，像城市夜航拍。',
		bg: '#050403',
		bgRgb: '5,4,3',
		accent: '#ffc24a',
		head: '#ffc24a',
		halo: '#ff7a00',
		trace: ['rgba(255,120,0,0.5)', '#ff9a1f', '#ffc24a', '#fff4d6'],
		ink: '240,225,195',
		glass: ['40,30,16', '14,10,6'],
		residential: '#0b0906',
		green: '#070a06',
		water: '#05080d',
		waterEdge: '#2a2418',
		waterway: '#1a1710',
		roadMinor: '#1a140c',
		roadMajor: '#3d2c14',
		roadGlow: '#2a1c08',
		highway: '#7a5420',
		rail: '#20190f',
		building: ['#0f0c08', '#3a2a12', '#b07a2a'],
		buildingOpacity: 0.92,
		stopIdle: '#2a1e0c',
		sky: {sky: '#030201', horizon: '#3a2408', fog: '#0c0805'},
		light: '#ffd9a0',
	},
	hologram: {
		id: 'hologram',
		label: '全息线框',
		desc: '楼块半透明加发光描边，地面网格，荧光绿轨迹，偏科幻雷达。',
		bg: '#010806',
		bgRgb: '1,8,6',
		accent: '#39ffb0',
		head: '#39ffb0',
		halo: '#00ff9c',
		trace: ['rgba(0,255,156,0.5)', '#00ffa0', '#39ffb0', '#eafff5'],
		ink: '190,255,225',
		glass: ['6,40,30', '2,14,10'],
		residential: '#020c09',
		green: '#021008',
		water: '#021418',
		waterEdge: '#0f5a55',
		waterway: '#0a3d3a',
		roadMinor: '#0b2a20',
		roadMajor: '#16604a',
		roadGlow: '#0a3a2a',
		highway: '#22a07a',
		rail: '#0e3326',
		building: ['#03140f', '#063a2a', '#0b6a4c'],
		buildingOpacity: 0.35,
		buildingOutline: '#1fdc9a',
		grid: '#0b3426',
		stopIdle: '#03241a',
		sky: {sky: '#000403', horizon: '#06301f', fog: '#020c08'},
		light: '#b0ffd8',
	},
	blueprint: {
		id: 'blueprint',
		label: '工程蓝图',
		desc: '深蓝图纸底、白色细线路网、橙色轨迹，偏规划图纸。',
		bg: '#0a2340',
		bgRgb: '10,35,64',
		accent: '#ff8a3d',
		head: '#ff8a3d',
		halo: '#ff6a00',
		trace: ['rgba(255,140,60,0.6)', '#ff8a3d', '#ffb27a', '#ffffff'],
		ink: '220,235,255',
		glass: ['16,48,86', '8,28,52'],
		residential: '#0c2747',
		green: '#0d2b4a',
		water: '#081c35',
		waterEdge: '#8fb4e0',
		waterway: '#6f97c8',
		roadMinor: '#33588a',
		roadMajor: '#9cbbe6',
		roadGlow: '#1a3f6e',
		highway: '#e6f0ff',
		rail: '#5a7fae',
		building: ['#0e2c50', '#163a66', '#1f4b80'],
		buildingOpacity: 0.55,
		buildingOutline: '#7fa3d6',
		grid: '#16375e',
		stopIdle: '#123660',
		sky: {sky: '#081d36', horizon: '#1b4675', fog: '#0a2340'},
		light: '#ffffff',
	},
	xhs: {
		id: 'xhs',
		label: '小红书红',
		desc: '暖黑底、品牌红轨迹，和平台调性一致。',
		bg: '#0a0506',
		bgRgb: '10,5,6',
		accent: '#ff2442',
		head: '#ff2442',
		halo: '#ff2442',
		trace: ['rgba(255,36,66,0.5)', '#ff2442', '#ff5c74', '#fff0f2'],
		ink: '255,220,225',
		glass: ['48,16,22', '16,6,8'],
		residential: '#120809',
		green: '#0b0a08',
		water: '#0e0a12',
		waterEdge: '#3a1a22',
		waterway: '#2a1218',
		roadMinor: '#1e1012',
		roadMajor: '#4a1c24',
		roadGlow: '#300c14',
		highway: '#7a2a36',
		rail: '#24121a',
		building: ['#140a0c', '#2a1216', '#4a1a22'],
		buildingOpacity: 0.9,
		stopIdle: '#2a0c12',
		sky: {sky: '#060203', horizon: '#3a0c16', fog: '#100608'},
		light: '#ffc0c8',
	},
	toon: {
		id: 'toon',
		label: '手账卡通',
		desc: '奶油纸底、粗描边道路、矮胖的彩色楼块，Q 版小车沿路跑，像旅行手账。',
		bg: '#f4e7c8',
		bgRgb: '244,231,200',
		accent: '#ff6b4a',
		head: '#ff6b4a',
		halo: '#ff6b4a',
		trace: ['#ffb199', '#ff8a65', '#ff6b4a', '#ff5a36'],
		ink: '120,88,60',
		glass: ['255,251,240', '250,240,215'],
		residential: '#f0dcae',
		green: '#bcd98c',
		water: '#8fcfe6',
		waterEdge: '#5a9fbf',
		waterway: '#7cc0dc',
		roadMinor: '#fff8e6',
		roadMajor: '#ffffff',
		roadGlow: '#c9a77a',
		highway: '#ffd36b',
		rail: '#c9a77a',
		building: ['#f7d6a8', '#f2b8a2', '#a9cfe8'],
		buildingOpacity: 1,
		buildingOutline: '#c49a68',
		stopIdle: '#fff3d6',
		sky: {sky: '#bfe3f2', horizon: '#fff6df', fog: '#f4e7c8'},
		light: '#ffffff',
		flat: true,
		text: '#4a3020',
		shadow: '0 10px 28px rgba(110,70,30,0.22), inset 0 1px 0 rgba(255,255,255,0.6)',
		vignette: 0.12,
		paper: true,
		lightIntensity: 0.18,
		roadCase: '#c9a77a',
		traceCase: '#5a3a22',
		headIcon: 'car',
		buildingScale: 0.45,
	},
	terrain: {
		id: 'terrain',
		label: '山野地形',
		desc: '真实海拔起伏和山体阴影，轨迹贴着地形走。山城、徒步、骑行路线效果明显，平原城市看不出起伏。',
		bg: '#e8e2cf',
		bgRgb: '232,226,207',
		accent: '#ff5a1f',
		head: '#ff5a1f',
		halo: '#ff5a1f',
		trace: ['rgba(255,90,31,0.65)', '#ff7a3d', '#ff5a1f', '#fff1e6'],
		ink: '60,70,55',
		glass: ['250,248,240', '236,232,218'],
		residential: '#d9ceb2',
		green: '#b9cf98',
		water: '#86b9d0',
		waterEdge: '#5f97b3',
		waterway: '#79aecb',
		roadMinor: '#f7f3e8',
		roadMajor: '#fffaf0',
		roadGlow: '#b9ab8c',
		highway: '#ffd27a',
		rail: '#a89c80',
		building: ['#ece5d4', '#ddd2ba', '#cbbd9d'],
		buildingOpacity: 0.95,
		stopIdle: '#fffaf0',
		sky: {sky: '#a9cbe0', horizon: '#efe9d8', fog: '#e8e2cf'},
		light: '#fff6e0',
		flat: true,
		text: '#2a3326',
		shadow: '0 10px 30px rgba(40,50,30,0.25), inset 0 1px 0 rgba(255,255,255,0.6)',
		vignette: 0.18,
		lightIntensity: 0.35,
		roadCase: '#b9ab8c',
		traceCase: '#ffffff',
		terrain: {
			exaggeration: 1.6,
			shadow: '#5b4a30',
			highlight: '#fffdf5',
			relief: [
				[0, '#c9d6a6'],
				[200, '#d8dcae'],
				[400, '#e3d5a3'],
				[800, '#d6bd8e'],
				[1500, '#c6ad8c'],
				[3000, '#eeeae0'],
			],
		},
	},
};

export const DEFAULT_THEME = 'cyan';
export const getTheme = (id?: string): Theme => THEMES[id ?? DEFAULT_THEME] ?? THEMES[DEFAULT_THEME];

// '#rrggbb' → 'rgba(r,g,b,a)'
export const alpha = (hex: string, a: number) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
