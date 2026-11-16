// 内置示例：工作台首次打开时的默认路线，也用于测试。路线数据已固化，不需要联网算路。
import chengdu from './route-chengdu.json';
import chongqing from './route-chongqing.json';
import {DEFAULT_SHOW, DEFAULT_TEXTS, DURATION_RANGE, DYNAMICS_DEFAULT, type LngLat, type VideoConfig} from '../video/config';

type Sample = {
	id: string;
	label: string;
	city: string;
	data: {coordinates: number[][]; distanceMeters: number; source: string; landmarks: {name: string; en: string; lngLat: number[]}[]};
	theme: string;
	durationS: number;
	title: [string, string];
};

export const SAMPLES: Sample[] = [
	{id: 'chengdu', label: '成都 · 天府广场到二仙桥', city: '成都', data: chengdu, theme: 'gold', durationS: 8.5, title: ['走成华大道，', '到二仙桥']},
	{id: 'chongqing', label: '重庆 · 两江环线', city: '重庆', data: chongqing, theme: 'hologram', durationS: 9.5, title: ['重庆两江环线，', '一路跨三桥']},
];

export const sampleConfig = (id: string): VideoConfig => {
	const s = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
	return {
		theme: s.theme,
		aspect: '9:16',
		durationS: s.durationS ?? DURATION_RANGE.default,
		dynamics: DYNAMICS_DEFAULT,
		route: {coordinates: s.data.coordinates, distanceMeters: s.data.distanceMeters, source: s.data.source},
		landmarks: s.data.landmarks.map((l) => ({name: l.name, en: l.en, lngLat: l.lngLat as LngLat})),
		texts: {...DEFAULT_TEXTS, title1: s.title[0], title2: s.title[1], via: s.data.landmarks.map((l) => l.name).join(' → ')},
		show: {...DEFAULT_SHOW},
	};
};
