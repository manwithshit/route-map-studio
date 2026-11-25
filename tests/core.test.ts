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

describe('同城规则', async () => {
	const {cityNameOf} = await import('../server/amap');
	const {cityConflict, emptyPoint} = await import('../src/app/state');
	const at = (role: 'start' | 'via' | 'end', name: string, cityCode: string, cityName: string) => ({
		...emptyPoint(role),
		name,
		place: {id: name, name, district: '', address: '', lngLat: [0, 0] as LngLat, cityCode, cityName},
	});
	it('从高德 district 取出地级市 / 直辖市名', () => {
		expect(cityNameOf('四川省成都市锦江区')).toBe('成都市');
		expect(cityNameOf('重庆市渝中区')).toBe('重庆市');
		expect(cityNameOf('四川省阿坝藏族羌族自治州九寨沟县')).toBe('阿坝藏族羌族自治州');
	});
	it('同一城市不报冲突，未选的点不参与判断', () => {
		expect(cityConflict([at('start', '春熙路', '5101', '成都市'), emptyPoint('via'), at('end', '二仙桥', '5101', '成都市')])).toBeNull();
	});
	it('跨城市时指出是哪个点', () => {
		const msg = cityConflict([at('start', '春熙路', '5101', '成都市'), at('via', '武侯祠', '5101', '成都市'), at('via', '洪崖洞', '5001', '重庆市'), at('end', '二仙桥', '5101', '成都市')]);
		expect(msg).toContain('途经点 2「洪崖洞」在重庆市');
		expect(msg).toContain('起点「春熙路」在成都市');
	});
	it('旧版本存下的无城市码地点和超长路线，载入时被清掉', async () => {
		const {sanitize, sampleState} = await import('../src/app/state');
		const s = sampleState('chongqing');
		const old = {...s, points: s.points.map((p, i) => (i === 0 ? {...p, place: {...p.place!, cityCode: ''}} : p)), route: {...s.route!, distanceMeters: 1_600_000}};
		const clean = sanitize(old);
		expect(clean.points[0].place).toBeNull();
		expect(clean.points[1].place).not.toBeNull();
		expect(clean.route).toBeNull();
		expect(sanitize(s)).toBe(s);
	});
});

describe('途经点可选', async () => {
	const {clearedRoute, emptyPoint, pointsKey, sampleState, toVideoConfig} = await import('../src/app/state');
	it('清空后只剩起点和终点', () => {
		const s = clearedRoute(sampleState('chengdu'));
		expect(s.points.map((p) => p.role)).toEqual(['start', 'end']);
		expect(s.route).toBeNull();
	});
	it('没选地点的途经点不改变算路，也不进地标', () => {
		const s = sampleState('chengdu');
		const withEmpty = {...s, points: [s.points[0], emptyPoint('via'), ...s.points.slice(1)]};
		expect(pointsKey(withEmpty.points)).toBe(pointsKey(s.points));
		expect(toVideoConfig(withEmpty)!.landmarks).toEqual(toVideoConfig(s)!.landmarks);
	});
});

describe('卡通和地形风格', async () => {
	const {THEMES} = await import('../src/video/themes');
	const {buildStyle} = await import('../src/video/mapStyle');
	const ids = (theme: string) => {
		const cfg = {...sampleConfig('chengdu'), theme};
		return buildStyle(THEMES[theme], getTimeline(cfg)).layers.map((l) => l.id);
	};
	it('前 6 套的图层顺序不变', () => {
		expect(ids('xhs')).toEqual(ids('cyan'));
		expect(ids('cyan')).toContain('trace-halo');
		expect(ids('cyan')).toContain('head-core');
		expect(ids('cyan')).not.toContain('head-car');
	});
	it('卡通不画发光，车头换成小车', () => {
		const l = ids('toon');
		expect(THEMES.toon.headIcon).toBe('car');
		expect(l).not.toContain('head-core'); // 车头由 3D 小车图层画
		expect(l).toContain('trace-case');
		for (const glow of ['trace-halo', 'trace-glow', 'flow-glow', 'road-major-glow', 'head-glow', 'head-ring']) expect(l).not.toContain(glow);
	});
	it('每套风格都有分组、说明和缩略图', async () => {
		const {existsSync} = await import('node:fs');
		for (const t of Object.values(THEMES)) {
			expect(t.group, t.id).toBeTruthy();
			expect(t.desc.length, t.id).toBeGreaterThan(8);
			expect(existsSync(`public/themes/${t.id}.jpg`), t.id).toBe(true);
		}
		expect(Object.keys(THEMES).length).toBeGreaterThanOrEqual(10);
	});
	it('有小车的风格，站名在最上层（3D 小车插在它下面）', () => {
		for (const id of ['toon', 'mini']) {
			const l = ids(id);
			expect(l.at(-1), id).toBe('stop-label');
		}
	});
	it('浅色风格都不画发光，主文字是深色', () => {
		for (const t of Object.values(THEMES).filter((x) => x.flat)) {
			expect(ids(t.id), t.id).not.toContain('trace-halo');
			const n = parseInt(t.text!.slice(1), 16);
			const luma = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
			expect(luma, t.id).toBeLessThan(80);
		}
	});
	it('地形风格带海拔和山体阴影', () => {
		const style = buildStyle(THEMES.terrain, getTimeline({...sampleConfig('chongqing'), theme: 'terrain'}));
		expect(style.terrain?.source).toBe('dem');
		expect(style.layers.map((l) => l.id)).toEqual(expect.arrayContaining(['relief', 'hillshade']));
	});
	// 不平滑时重庆示例的急弯一帧会转 27° 以上，看着像车在跳
	for (const id of ['chengdu', 'chongqing']) {
		it(`${id}：小车朝向逐帧连续，一帧转向不超过 13°`, () => {
			const tl = getTimeline({...sampleConfig(id), theme: 'toon'});
			let prev: number | null = null;
			let worst = 0;
			for (let f = 0; f < Math.round(tl.cfg.durationS * 60); f++) {
				const hd = tl.getFrameState(f).heading;
				if (prev !== null) worst = Math.max(worst, Math.abs(hd - prev));
				prev = hd;
			}
			expect(worst).toBeLessThan(13);
		});
	}
});

describe('下线的风格', async () => {
	const {sanitize} = await import('../src/app/state');
	const {sampleState} = await import('../src/app/state');
	it('旧存档里的黑金夜景换成默认风格，路线保留', () => {
		const s = {...sampleState('chengdu'), theme: 'gold'};
		const out = sanitize(s);
		expect(out.theme).toBe('cyan');
		expect(out.points).toBe(s.points);
	});
});

describe('30fps 输出', async () => {
	const {durationFrames, outFps} = await import('../src/video/config');
	it('帧数按输出帧率算，默认 60', () => {
		const c = sampleConfig('chengdu');
		expect(outFps(c)).toBe(60);
		expect(durationFrames(c)).toBe(510);
		expect(durationFrames({...c, fps: 30})).toBe(255);
	});
});

describe('闭合环线与几何缓存（回归测试）', async () => {
	const {routeGeometryHash} = await import('../src/video/timeline');
	it('闭合环线的起终点坐标相同时，终点落在总里程与尾段帧，而非 km=0', () => {
		const start: LngLat = [104.06, 30.66];
		const p1: LngLat = [104.12, 30.66];
		const p2: LngLat = [104.12, 30.71];
		const p3: LngLat = [104.06, 30.71];
		const loopCfg = {
			...sampleConfig('chengdu'),
			route: {coordinates: [start, p1, p2, p3, start], distanceMeters: 20_510, source: 'test'},
			landmarks: [
				{name: '起点', en: 'START', lngLat: start},
				{name: '中点', en: 'MID', lngLat: p2},
				{name: '回到起点', en: 'END', lngLat: start},
			],
		};
		const tl = getTimeline(loopCfg);
		expect(tl.STOPS[0].km).toBeLessThan(0.05);
		expect(tl.STOPS[1].km).toBeGreaterThan(tl.ROUTE_KM * 0.35);
		expect(tl.STOPS[2].km).toBeGreaterThan(tl.ROUTE_KM * 0.95);
		expect(tl.STOPS[2].reachFrame).toBeGreaterThan(tl.DURATION_FRAMES * 0.5);
	});

	it('重复经过起终点的 8 字形环线（A → B → A → C → A），终点精确落到 ROUTE_KM', () => {
		const a: LngLat = [104.06, 30.66];
		const b: LngLat = [104.11, 30.66];
		const c: LngLat = [104.06, 30.71];
		const figure8 = {
			...sampleConfig('chengdu'),
			route: {coordinates: [a, b, a, c, a], distanceMeters: 23_578, source: 'test'},
			landmarks: [
				{name: '起点 A', en: 'START', lngLat: a, role: 'start' as const},
				{name: '终点 A', en: 'END', lngLat: a, role: 'end' as const},
			],
		};
		const tl = getTimeline(figure8);
		expect(tl.STOPS[0].km).toBe(0);
		expect(tl.STOPS[1].km).toBeCloseTo(tl.ROUTE_KM, 4);
		expect(tl.STOPS[1].reachFrame).toBeGreaterThan(tl.DURATION_FRAMES * 0.5);
	});

	it('仅修改路线中间坐标时，几何签名与 Timeline 缓存都会更新', () => {
		const base = sampleConfig('chengdu');
		const coords2 = base.route.coordinates.map((c, i) => (i === Math.floor(base.route.coordinates.length / 2) ? [c[0] + 0.005, c[1] + 0.005] : c));
		const mod = {...base, route: {...base.route, coordinates: coords2}};
		expect(routeGeometryHash(base.route.coordinates)).not.toBe(routeGeometryHash(mod.route.coordinates));
		expect(getTimeline(base)).not.toBe(getTimeline(mod));
	});
});

describe('服务端安全与边界校验（回归测试）', async () => {
	const http = await import('node:http');
	const path = await import('node:path');
	const {fileURLToPath} = await import('node:url');
	const {createApp} = await import('../server/index');
	const {startRender} = await import('../server/render');
	const {configFilePath} = await import('../server/store');
	const {isPathInside, validateVideoConfig} = await import('../server/validate');

	it('Key 配置文件默认存放在项目 Web 根目录之外', () => {
		const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
		expect(isPathInside(repoRoot, configFilePath(), true)).toBe(false);
	});

	it('路径边界判断能拦截前缀绕过（out-escape / out/../out-escape）', () => {
		const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
		const outRoot = path.join(repoRoot, 'out');
		expect(isPathInside(outRoot, path.resolve(repoRoot, 'out/e2e'), true)).toBe(true);
		expect(isPathInside(outRoot, path.resolve(repoRoot, 'out-escape'), true)).toBe(false);
		expect(isPathInside(outRoot, path.resolve(repoRoot, 'out/../out-escape'), true)).toBe(false);
	});

	it('非法 VideoConfig 与原型属性枚举绕过被拒绝且不会永久占住渲染锁', () => {
		const badAspect = {...sampleConfig('chengdu'), aspect: '../../evil' as Aspect};
		expect(() => validateVideoConfig(badAspect)).toThrow();
		expect(() => startRender(badAspect)).toThrow();
		for (const proto of ['toString', 'constructor', '__proto__']) {
			expect(() => validateVideoConfig({...sampleConfig('chengdu'), theme: proto}), `theme=${proto}`).toThrow();
			expect(() => validateVideoConfig({...sampleConfig('chengdu'), aspect: proto as Aspect}), `aspect=${proto}`).toThrow();
		}
		const missingTexts = {...sampleConfig('chengdu'), texts: undefined as never};
		expect(() => startRender(missingTexts)).toThrow(/texts|文案/);
	});

	it('本地 HTTP 服务拒绝外部 Host、跨源 Origin、敏感路径与生产自定义 outputDir', async () => {
		const app = await createApp({withUi: false});
		const server = app.listen(0, '127.0.0.1');
		await new Promise((r) => server.once('listening', r));
		const {port} = server.address() as {port: number};
		const req = (method: string, reqPath: string, headers: Record<string, string>, body?: string) =>
			new Promise<{status: number; text: string}>((resolve, reject) => {
				const r = http.request({host: '127.0.0.1', port, path: reqPath, method, headers}, (res) => {
					let text = '';
					res.setEncoding('utf8');
					res.on('data', (c) => (text += c));
					res.on('end', () => resolve({status: res.statusCode ?? 0, text}));
				});
				r.on('error', reject);
				if (body) r.write(body);
				r.end();
			});
		try {
			const okCfg = await req('GET', '/api/config', {Host: `127.0.0.1:${port}`});
			expect(okCfg.status).toBe(200);

			const badHost = await req('GET', '/api/config', {Host: 'evil.example:5317'});
			expect(badHost.status).toBe(403);

			const badOrigin = await req('GET', '/api/config', {Host: `127.0.0.1:${port}`, Origin: 'https://evil.example'});
			expect(badOrigin.status).toBe(403);

			const crossSite = await req('GET', '/api/config', {Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site'});
			expect(crossSite.status).toBe(403);

			const leakFile = await req('GET', '/config.local.json', {Host: `127.0.0.1:${port}`});
			expect(leakFile.status).toBe(404);

			const customOut = await req(
				'POST',
				'/api/render',
				{Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json'},
				JSON.stringify({config: sampleConfig('chengdu'), outputDir: 'out/e2e'}),
			);
			expect(customOut.status).toBe(400);
		} finally {
			server.close();
		}
	});
});
