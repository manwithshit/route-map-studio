// 本地服务：工作台页面（Vite 中间件）+ 接口。只监听 127.0.0.1，严格校验 Host/Origin，
// 禁止任何外部域名或跨站脚本访问本地接口与配置文件。
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express, {type RequestHandler} from 'express';
import {createServer as createViteServer} from 'vite';
import {AmapError, inputTips, testKey} from './amap';
import {getJob, OUTPUT_DIR, startRender} from './render';
import {fetchRoute} from './routing';
import {clearAmapKey, getAmapKey, maskKey, setAmapKey} from './store';
import {isPathInside, validateRoutePoints, validateVideoConfig, ValidationError} from './validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_ROOT = path.join(ROOT, 'out');
const PORT = Number(process.env.PORT) || 5317;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const isAllowedHost = (hostHeader?: string): boolean => {
	if (!hostHeader) return false;
	try {
		const u = new URL(`http://${hostHeader}`);
		return LOOPBACK_HOSTS.has(u.hostname.toLowerCase()) && u.host.toLowerCase() === hostHeader.trim().toLowerCase();
	} catch {
		return false;
	}
};

const isAllowedOrigin = (originHeader: string | undefined, hostHeader: string | undefined): boolean => {
	if (!originHeader) return true;
	if (!hostHeader) return false;
	try {
		const u = new URL(originHeader);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
		if (!LOOPBACK_HOSTS.has(u.hostname.toLowerCase())) return false;
		return u.host.toLowerCase() === hostHeader.trim().toLowerCase();
	} catch {
		return false;
	}
};

const BLOCKED_PATH_RE = /(^|\/)(\.git|\.env($|\.)|config\.local\.json$|server(\/|$))/i;

const localSecurityGuard: RequestHandler = (req, res, next) => {
	const host = req.headers.host;
	if (!isAllowedHost(host)) {
		res.status(403).json({error: '拒绝访问：仅允许通过本地回环地址访问工作台。'});
		return;
	}
	const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
	if (!isAllowedOrigin(origin, host)) {
		res.status(403).json({error: '拒绝跨源请求。'});
		return;
	}
	const fetchSite = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].toLowerCase() : '';
	if (req.path.startsWith('/api/') && fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
		res.status(403).json({error: '拒绝跨站 API 请求。'});
		return;
	}
	let decodedPath = req.path;
	try {
		decodedPath = decodeURIComponent(req.path);
	} catch {
		res.status(400).json({error: '无效的请求路径。'});
		return;
	}
	if (decodedPath.includes('..') || BLOCKED_PATH_RE.test(decodedPath)) {
		res.status(404).end();
		return;
	}
	next();
};

export const createApp = async (opts: {withUi?: boolean; allowCustomOutputDir?: boolean} = {}) => {
	const app = express();
	app.use(localSecurityGuard);
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
			const points = validateRoutePoints(req.body?.points);
			res.json(await fetchRoute(points));
		} catch (e) {
			const status = e instanceof ValidationError ? 400 : 502;
			res.status(status).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.post('/api/render', (req, res) => {
		try {
			const config = validateVideoConfig(req.body?.config);
			const rawScale = req.body?.scale;
			const scale = rawScale === undefined ? 1 : Number(rawScale);
			if (!Number.isFinite(scale) || scale < 0.25 || scale > 1) {
				throw new ValidationError('scale 必须在 0.25 到 1 之间。');
			}
			let outDir: string | undefined;
			if (req.body?.outputDir !== undefined) {
				if (!opts.allowCustomOutputDir) {
					throw new ValidationError('生产模式不允许自定义输出目录。');
				}
				const candidate = path.resolve(ROOT, String(req.body.outputDir));
				if (!isPathInside(OUT_ROOT, candidate, true)) {
					throw new ValidationError('输出目录只能在项目 out/ 下。');
				}
				outDir = candidate;
			}
			const job = startRender(config, {scale, outputDir: outDir});
			res.json(job);
		} catch (e) {
			const status = e instanceof ValidationError ? 400 : 409;
			res.status(status).json({error: e instanceof Error ? e.message : String(e)});
		}
	});

	app.get('/api/render/:id', (req, res) => {
		const job = getJob(req.params.id);
		if (!job) res.status(404).json({error: '找不到这个渲染任务。'});
		else res.json(job);
	});

	// 在 Finder 里定位成片；只允许输出目录内已存在的文件（防止符号链接与前缀绕过）
	app.post('/api/reveal', (req, res) => {
		const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
		if (!rawPath) {
			res.status(400).json({error: '缺少文件路径。'});
			return;
		}
		const p = path.resolve(rawPath);
		if (!existsSync(p) || !isPathInside(OUTPUT_DIR, p, false)) {
			res.status(400).json({error: '只能打开输出目录里的文件。'});
			return;
		}
		execFile('open', ['-R', p], () => res.json({ok: true}));
	});

	if (opts.withUi !== false) {
		const vite = await createViteServer({
			root: ROOT,
			server: {
				middlewareMode: true,
				fs: {
					deny: ['.env', '.env.*', '**/config.local.json', '**/server/**', '**/.git/**'],
				},
			},
			appType: 'spa',
			// 3D 小车只在卡通、微缩风格才用到。启动时就打包好 three.js，否则第一次切到这两套风格时
			// Vite 才发现新依赖，会重新打包并整页刷新
			optimizeDeps: {include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js']},
		});
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
