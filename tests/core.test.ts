import {describe, expect, it} from 'vitest';
import {sampleConfig} from '../src/samples';
import {gcjToWgs, wgsToGcj} from '../src/shared/gcj';
import {checkRoute, overlapMeters} from '../src/shared/health';
import {cleanName, defaultEn} from '../src/shared/names';
import {ASPECTS, type Aspect, type LngLat} from '../src/video/config';
import {getLayout} from '../src/video/layout';
import {baseBearingFor, dynamicsParams, getTimeline} from '../src/video/timeline';

const meters = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 96000, (a[1] - b[1]) * 111320);

describe('GCJ-02 ↔ WGS-84', () => {
	it('成都一带的偏移在 300–700 米，反解误差小于 1 米', () => {
		const wgs: LngLat = [104.06429, 30.66002];
		const gcj = wgsToGcj(wgs);
		expect(meters(wgs, gcj)).toBeGreaterThan(300);
		expect(meters(wgs, gcj)).toBeLessThan(700);
		expect(meters(gcjToWgs(gcj), wgs)).toBeLessThan(1);
	});
	it('境外坐标不做偏移', () => {
		expect(gcjToWgs([2.35, 48.85])).toEqual([2.35, 48.85]);
	});
});

describe('地点名', () => {
	it('去掉括号里的分店信息', () => {
		expect(cleanName('重庆来福士广场(朝天门店)')).toBe('重庆来福士广场');
		expect(cleanName('洪崖洞（民俗风貌区）')).toBe('洪崖洞');
	});
	it('英文名默认拼音，长名两字一组', () => {
		expect(defaultEn('洪崖洞')).toBe('HONGYADONG');
		expect(defaultEn('天府广场')).toBe('TIANFU GUANGCHANG');
	});
});

describe('路线体检', () => {
	it('两个示例路线没有错误和折返提示', () => {
		for (const id of ['chengdu', 'chongqing']) {
			const c = sampleConfig(id);
			const issues = checkRoute({coordinates: c.route.coordinates as LngLat[], distanceMeters: c.route.distanceMeters, durationS: c.durationS, landmarks: c.landmarks});
			expect(issues.filter((i) => i.level === 'error' || i.code === 'overlap')).toEqual([]);
		}
	});
	it('过去再折返的路线会被发现', () => {
		const line: LngLat[] = [
			[104.0, 30.0],
			[104.01, 30.0],
			[104.0, 30.0],
		];
		expect(overlapMeters(line)).toBeGreaterThan(300);
		expect(checkRoute({coordinates: line, distanceMeters: 1900, durationS: 8, landmarks: []}).map((i) => i.code)).toContain('overlap');
	});
	it('路线太长、时长太短会提示加时长', () => {
		const c = sampleConfig('chengdu');
		const issues = checkRoute({coordinates: c.route.coordinates as LngLat[], distanceMeters: 40000, durationS: 6, landmarks: []});
		expect(issues.map((i) => i.code)).toContain('too-fast');
	});
});

describe('时间轴', () => {
	const aspects = Object.keys(ASPECTS) as Aspect[];
	for (const id of ['chengdu', 'chongqing']) {
		for (const aspect of aspects) {
			it(`${id} ${aspect}：轨迹终点每帧都等于车头、镜头转向连续`, () => {
				const tl = getTimeline({...sampleConfig(id), aspect});
				let prev: number[] = [];
				let maxD2 = 0;
				for (let f = 0; f < tl.DURATION_FRAMES; f++) {
					const s = tl.getFrameState(f);
					const end = s.trace.geometry.coordinates[s.trace.geometry.coordinates.length - 1] as LngLat;
					if (s.km > 0.01) expect(meters(end, s.head)).toBeLessThan(0.5);
					prev.push(s.camera.bearing);
					if (prev.length === 3) {
						maxD2 = Math.max(maxD2, Math.abs(prev[2] - 2 * prev[1] + prev[0]));
						prev = prev.slice(1);
					}
				}
				expect(maxD2).toBeLessThan(0.6);
				const frames = tl.STOPS.map((s) => s.reachFrame);
				expect([...frames].sort((a, b) => a - b)).toEqual(frames);
				expect(tl.summaryStart).toBeLessThan(tl.DURATION_FRAMES);
				expect(tl.getFrameState(tl.DURATION_FRAMES - 1).progress).toBeCloseTo(1, 5);
			});
		}
	}
	it('镜头动感 50 对应已验证的成片参数', () => {
		const p = dynamicsParams(50);
		expect(p.yawFollow).toBeCloseTo(0.45);
		expect(p.bearingSigma).toBeCloseTo(16);
	});
	it('环线（起终点重合）正北朝上', () => {
		const c = sampleConfig('chongqing');
		expect(baseBearingFor(c.route.coordinates as LngLat[], Math.cos((29.57 * Math.PI) / 180))).toBe(0);
	});
});

describe('布局', () => {
	it('9:16 的 HUD 不进入小红书顶栏、底栏和右侧互动区', () => {
		const L = getLayout('9:16');
		expect(L.topY).toBeGreaterThanOrEqual(160);
		expect(L.panelY + L.panelH).toBeLessThanOrEqual(1720);
		expect(L.side + L.panelW).toBeLessThanOrEqual(940);
	});
});
