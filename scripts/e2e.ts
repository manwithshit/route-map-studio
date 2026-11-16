// 端到端测试：起服务 → Key 校验 → 算路 → 体检 → 渲染短视频 → 检查成片。
// 用法：pnpm e2e        （有 config.local.json 里的 Key 时会多测一项地点搜索）
//      WEBEND_KEY=xxx pnpm e2e   （额外验证“Web端 Key”会给出正确的改法提示）
import {execFileSync} from 'node:child_process';
import {existsSync, rmSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/index';
import {getAmapKey} from '../server/store';
import {sampleConfig} from '../src/samples';
import {checkRoute} from '../src/shared/health';
import type {LngLat, VideoConfig} from '../src/video/config';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'out/e2e');
let failed = 0;
const ok = (name: string, cond: boolean, detail = '') => {
	console.log(`${cond ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
	if (!cond) failed++;
};

const app = await createApp({withUi: true});
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (url: string, body: unknown) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

try {
	// 1. 页面能打开
	const html = await (await fetch(base + '/')).text();
	ok('工作台页面可访问', html.includes('路线地图工作台'));
	const mod = await fetch(base + '/src/app/main.tsx');
	ok('前端模块可编译', mod.ok);

	// 2. Key 校验
	const bad = await post('/api/key', {key: 'abc'});
	ok('格式不对的 Key 被拒绝', bad.status === 400);
	if (process.env.WEBEND_KEY) {
		const r = await post('/api/key', {key: process.env.WEBEND_KEY});
		const d = await r.json();
		ok('Web端 Key 给出“改选 Web服务”的提示', r.status === 400 && String(d.error).includes('Web服务'), d.error);
	}

	// 3. 地点搜索（需要已保存的 Web服务 Key）
	if (getAmapKey()) {
		const r = await fetch(`${base}/api/search?${new URLSearchParams({q: '春熙路', city: '成都'})}`);
		const d = await r.json();
		const first = d.places?.[0];
		ok('高德补全返回成都的结果', r.ok && d.places?.length > 0 && first.lngLat[0] > 103.5 && first.lngLat[0] < 104.5, first ? `${first.name} ${first.lngLat}` : d.error);
	} else {
		console.log('- 跳过地点搜索：本机还没保存 Web服务 Key');
	}

	// 4. 算路 + 体检
	const sample = sampleConfig('chengdu');
	const points = sample.landmarks.map((l) => l.lngLat);
	points.splice(3, 0, [104.11985, 30.6677]); // 示例里为避开折返加的途经点
	const rr = await post('/api/route', {points});
	const route = await rr.json();
	ok('算路成功', rr.ok && route.coordinates?.length > 50, `${route.distanceMeters} 米，${route.coordinates?.length} 个点`);
	const issues = checkRoute({coordinates: route.coordinates, distanceMeters: route.distanceMeters, durationS: 6, landmarks: sample.landmarks});
	ok('体检无错误', !issues.some((i) => i.level === 'error'), issues.map((i) => i.code).join(',') || '无提示');

	// 5. 渲染：6 秒、半分辨率、全息主题、3:4（覆盖非默认画幅）
	const config: VideoConfig = {
		...sample,
		theme: 'hologram',
		aspect: '3:4',
		durationS: 6,
		route: {coordinates: route.coordinates as LngLat[], distanceMeters: route.distanceMeters, source: route.source},
	};
	rmSync(OUT, {recursive: true, force: true});
	const t0 = Date.now();
	const jr = await post('/api/render', {config, scale: 0.5, outputDir: 'out/e2e'});
	let job = await jr.json();
	ok('渲染任务已创建', jr.ok, job.error ?? job.id);
	while (job.status === 'bundling' || job.status === 'rendering') {
		await new Promise((r) => setTimeout(r, 1500));
		job = await (await fetch(`${base}/api/render/${job.id}`)).json();
	}
	ok('渲染完成', job.status === 'done', job.error ?? `${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
	if (job.output && existsSync(job.output)) {
		const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'csv=p=0', job.output]).toString().trim();
		const [w, h, fps, frames] = probe.split(',');
		ok('成片尺寸 540×720（3:4 半分辨率）', w === '540' && h === '720', probe);
		ok('成片 60fps、360 帧', fps === '60/1' && frames === '360');
	}
} finally {
	server.close();
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
