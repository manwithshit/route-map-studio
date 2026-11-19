// 本地服务：工作台页面（Vite 中间件）+ 接口。只监听 127.0.0.1，Key 不会离开本机（除了发给高德）。
import {execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {AmapError, inputTips, testKey} from './amap';
import {getJob, OUTPUT_DIR, startRender} from './render';
import {fetchRoute} from './routing';
import {clearAmapKey, getAmapKey, maskKey, setAmapKey} from './store';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 5317;

export const createApp = async (opts: {withUi?: boolean} = {}) => {
	const app = express();
	app.use(express.json({limit: '20mb'}));

	app.get('/api/config', (_req, res) => {
		const key = getAmapKey();
		res.json({hasKey: Boolean(key), keyMasked: maskKey(key), outputDir: OUTPUT_DIR});
	});

	app.post('/api/key', async (req, res) => {
		const key = String(req.body?.key ?? '').trim();
		if (!/^[0-9a-f]{32}$/i.test(key)) {
			res.status(400).json({error: 'Key 应该是 32 位的字母和数字。请从高德控制台「Key」那一列完整复制。'});
			return;
		}
		try {
			await testKey(key);
			setAmapKey(key);
			res.json({ok: true, keyMasked: maskKey(key)});
		} catch (e) {
			res.status(400).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.delete('/api/key', (_req, res) => {
		if (process.env.AMAP_WEB_KEY) {
			res.status(409).json({error: 'Key 来自环境变量 AMAP_WEB_KEY，网页里删不掉。去掉这个环境变量后重启服务。'});
			return;
		}
		clearAmapKey();
		res.json({ok: true});
	});

	app.get('/api/search', async (req, res) => {
		const key = getAmapKey();
		if (!key) {
			res.status(401).json({error: '还没有填高德 Key。'});
			return;
		}
		const q = String(req.query.q ?? '').trim();
		if (!q) {
			res.json({places: []});
			return;
		}
		try {
			res.json({places: await inputTips(key, q, String(req.query.city ?? '').trim())});
		} catch (e) {
			res.status(e instanceof AmapError && e.infocode === '10009' ? 401 : 502).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.post('/api/route', async (req, res) => {
		try {
			const points = (req.body?.points ?? []) as [number, number][];
			res.json(await fetchRoute(points));
		} catch (e) {
			res.status(502).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.post('/api/render', (req, res) => {
		try {
			const scale = Number(req.body?.scale) || 1;
			// 自定义输出目录只允许项目 out/ 之下（给测试用），默认输出到桌面「路线视频」
			const outDir = req.body?.outputDir ? path.resolve(ROOT, String(req.body.outputDir)) : undefined;
			if (outDir && !outDir.startsWith(path.join(ROOT, 'out'))) throw new Error('输出目录只能在项目 out/ 下。');
			const job = startRender(req.body.config, {scale: Math.min(1, Math.max(0.25, scale)), outputDir: outDir});
			res.json(job);
		} catch (e) {
			res.status(409).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.get('/api/render/:id', (req, res) => {
		const job = getJob(req.params.id);
		if (!job) res.status(404).json({error: '找不到这个渲染任务。'});
		else res.json(job);
	});

	// 在 Finder 里定位成片；只允许输出目录内的文件
	app.post('/api/reveal', (req, res) => {
		const p = path.resolve(String(req.body?.path ?? ''));
		if (!p.startsWith(OUTPUT_DIR + path.sep)) {
			res.status(400).json({error: '只能打开输出目录里的文件。'});
			return;
		}
		execFile('open', ['-R', p], () => res.json({ok: true}));
	});

	if (opts.withUi !== false) {
		const vite = await createViteServer({root: ROOT, server: {middlewareMode: true}, appType: 'spa'});
		app.use(vite.middlewares);
	}
	return app;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const app = await createApp();
	app.listen(PORT, '127.0.0.1', () => {
		const url = `http://127.0.0.1:${PORT}`;
		console.log(`路线地图工作台已启动：${url}`);
		if (!process.env.NO_OPEN) execFile('open', [url]);
	});
}
