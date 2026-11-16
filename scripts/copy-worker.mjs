// MapLibre v6 的 ESM worker 不会被 Vite / Remotion 自动打包，安装后复制到 public/ 供两边加载。
import {copyFileSync, mkdirSync, existsSync} from 'node:fs';
const src = new URL('../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url);
if (existsSync(src)) {
	mkdirSync(new URL('../public/', import.meta.url), {recursive: true});
	copyFileSync(src, new URL('../public/maplibre-gl-worker.mjs', import.meta.url));
}
