// 渲染：首次渲染时打包一次 Remotion 工程，之后复用。单任务、单并发、ANGLE 后端，
// 与成片验证时的参数一致（并发 >1 时 WebGL 地图容易出错）。
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {ASPECTS, type VideoConfig} from '../src/video/config';
import {validateVideoConfig} from './validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const OUTPUT_DIR = path.join(os.homedir(), 'Desktop', '路线视频');

export type Job = {
	id: string;
	status: 'bundling' | 'rendering' | 'done' | 'error';
	progress: number; // 0–1
	output?: string;
	error?: string;
	startedAt: number;
};

let serveUrlPromise: Promise<string> | null = null;
const getServeUrl = () => {
	serveUrlPromise ??= bundle({
		entryPoint: path.join(ROOT, 'src/video/index.ts'),
		publicDir: path.join(ROOT, 'public'),
	}).catch((e) => {
		serveUrlPromise = null;
		throw e;
	});
	return serveUrlPromise;
};

const jobs = new Map<string, Job>();
let running: Job | null = null;

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s，,。]+/g, '').slice(0, 24) || '路线';
const ASPECT_TAG: Record<keyof typeof ASPECTS, string> = {'9:16': '9x16', '3:4': '3x4', '16:9': '16x9'};
const stamp = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export const startRender = (rawConfig: VideoConfig, opts: {scale?: number; outputDir?: string} = {}): Job => {
	// 先做全部同步校验与目录准备，避免同步异常导致渲染锁永久占住
	const config = validateVideoConfig(rawConfig);
	if (running && (running.status === 'bundling' || running.status === 'rendering')) {
		throw new Error('已有视频在渲染，完成后再开始下一个。');
	}
	const dir = opts.outputDir ?? OUTPUT_DIR;
	mkdirSync(dir, {recursive: true});

	const fpsTag = config.fps === 30 ? '_30fps' : '';
	const aspectTag = ASPECT_TAG[config.aspect];
	const output = path.join(dir, `${safeName(config.texts.title1 + config.texts.title2)}_${aspectTag}${fpsTag}_${stamp()}.mp4`);
	const id = Math.random().toString(36).slice(2, 10);
	const job: Job = {id, status: 'bundling', progress: 0, startedAt: Date.now()};
	jobs.set(id, job);
	running = job;

	(async () => {
		try {
			const serveUrl = await getServeUrl();
			job.status = 'rendering';
			const chromiumOptions = {gl: 'angle' as const};
			const composition = await selectComposition({serveUrl, id: 'TravelMap', inputProps: config, chromiumOptions});
			await renderMedia({
				composition,
				serveUrl,
				codec: 'h264',
				outputLocation: output,
				inputProps: config,
				chromiumOptions,
				concurrency: 1,
				imageFormat: 'jpeg',
				jpegQuality: 90,
				scale: opts.scale ?? 1,
				timeoutInMilliseconds: 90000,
				onProgress: ({progress}) => {
					job.progress = progress;
				},
			});
			job.status = 'done';
			job.progress = 1;
			job.output = output;
		} catch (e) {
			job.status = 'error';
			job.error = e instanceof Error ? e.message : String(e);
		} finally {
			if (running === job) running = null;
		}
	})();
	return job;
};

export const getJob = (id: string) => jobs.get(id);
