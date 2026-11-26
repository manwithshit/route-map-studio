// 生成 README 的封面（hero）、12 套风格墙（themes）、3 种画幅对比（aspects）中英文 WebP。
// 素材全部来自真实成片抽帧；仅依赖本机 Google Chrome 和 cwebp，无额外 npm 依赖。
// 用法：FRAMES=/tmp/rms_frames OUT=/path/to/assets/readme node assets/readme/source/compose.mjs
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FRAMES = process.env.FRAMES ?? '/tmp/rms_frames';
const OUT = process.env.OUT ?? path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const F = `file://${FRAMES}/`;

const SERIF = '"Songti SC","STSong","Noto Serif SC",Georgia,serif';
const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Helvetica Neue",sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,monospace';

const base = (w, h, body, css = '') => `<!doctype html>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{
  width:${w}px;height:${h}px;overflow:hidden;
  background:radial-gradient(1250px 920px at 78% 48%,#1d5869 0%,#123b49 48%,#0a232d 100%);
  color:#f4f1e6;font-family:${SANS};-webkit-font-smoothing:antialiased;
  position:relative;
}
.serif{font-family:${SERIF}}
.mono{font-family:${MONO};letter-spacing:.14em;text-transform:uppercase}
.meta-mono{font-family:${MONO};letter-spacing:.04em}
.phone{
  position:absolute;border-radius:36px;overflow:hidden;
  background:#09151a;
  border:7px solid #16242a;
  box-shadow:0 0 0 1.5px rgba(255,255,255,.14),0 36px 80px rgba(3,12,16,.62);
}
.phone img{width:100%;height:100%;object-fit:cover;display:block}
.rings{position:absolute;inset:0;pointer-events:none}
${css}
</style>
<body>${body}</body>`;

const RINGS_SVG = (cx, cy) => `
<svg class="rings" width="100%" height="100%" viewBox="0 0 2400 1080" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="rgba(220,242,248,0.085)" stroke-width="2">
    <circle cx="${cx}" cy="${cy}" r="360"/>
    <circle cx="${cx}" cy="${cy}" r="580"/>
    <circle cx="${cx}" cy="${cy}" r="820"/>
    <circle cx="${cx}" cy="${cy}" r="1080"/>
  </g>
</svg>`;

const T = {
	zh: {
		eyebrow: 'ROUTE MAP STUDIO',
		title: '路线地图工作台',
		sub1: '选几个地点，',
		subHi: '沿着真实马路',
		sub2: '跑出 3D 路线动画',
		pills: ['12 套风格', '3D 小车 & 真实地形', '本地一键渲染'],
		meta: 'mrlazyman · Open source · Remotion + MapLibre · 30 / 60fps',
		badge: '真实成片抽帧',
		themes: [
			{id: 'cyan', label: '暗夜青', group: '夜景霓虹', color: '#00f2fe'},
			{id: 'neon', label: '赛博霓虹', group: '夜景霓虹', color: '#ff2bd6'},
			{id: 'hologram', label: '全息线框', group: '夜景霓虹', color: '#39ffb0'},
			{id: 'blueprint', label: '工程蓝图', group: '夜景霓虹', color: '#ff8a3d'},
			{id: 'xhs', label: '暗夜朱砂', group: '夜景霓虹', color: '#ff2442'},
			{id: 'day', label: '清新日间', group: '日间清新', color: '#2f7cf6'},
			{id: 'mini', label: '微缩模型 · 3D小车', group: '日间清新', color: '#ef476f'},
			{id: 'toon', label: '绘本卡通 · 3D小车', group: '纸感手绘', color: '#ff6b4a'},
			{id: 'vintage', label: '复古纸图', group: '纸感手绘', color: '#c65a4a'},
			{id: 'ink', label: '钢笔线稿', group: '纸感手绘', color: '#e63b2e'},
			{id: 'terrain', label: '山野地形 · 海拔', group: '真实地形', color: '#ff5a1f'},
			{id: 'terrainNight', label: '夜色山城 · 海拔', group: '真实地形', color: '#ffb347'},
		],
		aspects: [
			{src: 'toon.jpg', label: '9:16 竖屏', px: '1080×1920', w: 430, h: 764},
			{src: 'aspect_3x4.jpg', label: '3:4 竖图', px: '1080×1440', w: 573, h: 764},
			{src: 'aspect_16x9.jpg', label: '16:9 横屏', px: '1920×1080', w: 1120, h: 630},
		],
	},
	en: {
		eyebrow: 'ROUTE MAP STUDIO',
		title: 'Route Map Studio',
		sub1: 'Pick a few places, render a ',
		subHi: 'real-road 3D',
		sub2: ' route video',
		pills: ['12 Themes', '3D Car & Terrain', 'Local Render'],
		meta: 'mrlazyman · Open source · Remotion + MapLibre · 30 / 60fps',
		badge: 'Real render frames',
		themes: [
			{id: 'cyan', label: 'Midnight Cyan', group: 'Night Neon', color: '#00f2fe'},
			{id: 'neon', label: 'Cyber Neon', group: 'Night Neon', color: '#ff2bd6'},
			{id: 'hologram', label: 'Hologram', group: 'Night Neon', color: '#39ffb0'},
			{id: 'blueprint', label: 'Blueprint', group: 'Night Neon', color: '#ff8a3d'},
			{id: 'xhs', label: 'Rednote Red', group: 'Night Neon', color: '#ff2442'},
			{id: 'day', label: 'Daylight', group: 'Daylight', color: '#2f7cf6'},
			{id: 'mini', label: 'Miniature · 3D Car', group: 'Daylight', color: '#ef476f'},
			{id: 'toon', label: 'Storybook · 3D Car', group: 'Paper & Toon', color: '#ff6b4a'},
			{id: 'vintage', label: 'Vintage Paper', group: 'Paper & Toon', color: '#c65a4a'},
			{id: 'ink', label: 'Ink Sketch', group: 'Paper & Toon', color: '#e63b2e'},
			{id: 'terrain', label: 'Terrain Relief', group: 'Real Terrain', color: '#ff5a1f'},
			{id: 'terrainNight', label: 'Night Hills', group: 'Real Terrain', color: '#ffb347'},
		],
		aspects: [
			{src: 'toon.jpg', label: '9:16 Vertical', px: '1080×1920', w: 430, h: 764},
			{src: 'aspect_3x4.jpg', label: '3:4 Portrait', px: '1080×1440', w: 573, h: 764},
			{src: 'aspect_16x9.jpg', label: '16:9 Landscape', px: '1920×1080', w: 1120, h: 630},
		],
	},
};

const hero = (l) => {
	const t = T[l];
	const isZh = l === 'zh';
	return base(
		2400,
		1080,
		`
${RINGS_SVG(1650, 540)}
<div style="position:absolute;left:128px;top:156px;width:1050px;z-index:2">
  <p class="mono" style="font-size:28px;color:#9cc0cb;font-weight:500">${t.eyebrow}</p>
  <h1 class="serif" style="font-size:${isZh ? 140 : 112}px;font-weight:600;color:#f4f1e6;letter-spacing:${isZh ? '.04em' : '-.01em'};line-height:1.1;margin-top:34px;white-space:nowrap">${t.title}</h1>
  <p style="font-size:${isZh ? 50 : 44}px;line-height:1.45;color:#eef4f6;margin-top:46px;font-weight:500">
    ${t.sub1}<span style="color:#f2d59b;font-weight:600">${t.subHi}</span>${isZh ? '<br>' : ''}${t.sub2}
  </p>
  <div style="display:flex;gap:22px;margin-top:64px;flex-wrap:nowrap">
    ${t.pills
			.map(
				(p) =>
					`<span style="padding:18px 34px;border-radius:999px;border:2px solid rgba(226,242,248,.26);background:rgba(9,31,39,.42);font-size:30px;color:#edf3f5;font-weight:500;white-space:nowrap">${p}</span>`,
			)
			.join('')}
  </div>
  <p class="meta-mono" style="font-size:24px;color:#8cb2be;margin-top:78px">${t.meta}</p>
</div>

<div class="phone" style="left:1245px;top:145px;width:434px;height:772px;transform:rotate(-4deg);z-index:1"><img src="${F}toon.jpg"></div>
<div class="phone" style="left:1568px;top:88px;width:472px;height:839px;transform:rotate(0.5deg);z-index:3"><img src="${F}terrainNight.jpg"></div>
<div class="phone" style="left:1926px;top:172px;width:406px;height:722px;transform:rotate(4deg);z-index:2"><img src="${F}mini.jpg"></div>

<div style="position:absolute;right:76px;bottom:52px;z-index:5;background:#f2ebd6;color:#142f38;font-size:28px;font-weight:700;padding:16px 34px;border-radius:999px;box-shadow:0 12px 30px rgba(4,16,22,.42)">${t.badge}</div>
`,
	);
};

const themes = (l) => {
	const t = T[l];
	const header = l === 'zh' ? '两条示例路线展示 12 套不同画法' : '12 distinct styles across two sample routes';
	const sub =
		l === 'zh'
			? '成都路线 10 套 · 重庆真实地形 2 套（均为真实成片抽帧）'
			: '10 Chengdu route themes · 2 Chongqing terrain themes (real frames)';
	return base(
		2400,
		1710,
		`
<div style="position:absolute;left:76px;right:76px;top:52px;display:flex;align-items:baseline;justify-content:space-between">
  <h2 class="serif" style="font-size:58px;font-weight:600;color:#f4f1e6;letter-spacing:.02em">${header}</h2>
  <p style="font-size:24px;color:#9cc0cb">${sub}</p>
</div>
<div style="position:absolute;left:76px;right:76px;top:156px;display:grid;grid-template-columns:repeat(6,1fr);gap:42px 26px">
  ${t.themes
		.map(
			(item) => `
    <figure style="display:flex;flex-direction:column">
      <div style="position:relative;width:100%;aspect-ratio:9/16;border-radius:22px;overflow:hidden;border:3px solid rgba(255,255,255,.14);box-shadow:0 18px 40px rgba(3,12,16,.48)">
        <img src="${F}${item.id}.jpg" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <figcaption style="margin-top:16px;display:flex;align-items:center;gap:10px;font-size:26px;font-weight:600;color:#eef4f6;white-space:nowrap">
        <i style="width:14px;height:14px;border-radius:50%;flex:none;background:${item.color};box-shadow:0 0 12px ${item.color}"></i>
        <span>${item.label}</span>
      </figcaption>
      <span style="margin-top:5px;margin-left:24px;font-size:20px;color:#8cb2be">${item.group}</span>
    </figure>`,
		)
		.join('')}
</div>
`,
	);
};

const aspects = (l) => {
	const t = T[l];
	const header = l === 'zh' ? '3 种画幅直接切换，同一套画面实时重排' : 'Three aspect ratios, reflowed live from one timeline';
	return base(
		2400,
		1040,
		`
<div style="position:absolute;left:84px;right:84px;top:48px;display:flex;align-items:baseline;justify-content:space-between">
  <h2 class="serif" style="font-size:54px;font-weight:600;color:#f4f1e6">${header}</h2>
  <p class="mono" style="font-size:22px;color:#8cb2be">1080P · 30 / 60FPS · MP4</p>
</div>
<div style="position:absolute;left:84px;right:84px;bottom:58px;display:flex;align-items:flex-end;justify-content:space-between">
  ${t.aspects
		.map(
			(a) => `
    <figure style="display:flex;flex-direction:column;align-items:flex-start">
      <div style="width:${a.w}px;height:${a.h}px;border-radius:24px;overflow:hidden;border:4px solid rgba(255,255,255,.15);box-shadow:0 26px 60px rgba(3,12,16,.55)">
        <img src="${F}${a.src}" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <figcaption style="margin-top:24px;font-size:32px;font-weight:600;color:#f4f1e6">
        ${a.label} <span class="mono" style="font-size:22px;color:#9cc0cb;margin-left:12px">${a.px}</span>
      </figcaption>
    </figure>`,
		)
		.join('')}
</div>
`,
	);
};

fs.mkdirSync(OUT, {recursive: true});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-readme-'));

for (const [name, fn, w, h] of [
	['hero', hero, 2400, 1080],
	['themes', themes, 2400, 1710],
	['aspects', aspects, 2400, 1040],
]) {
	for (const l of ['zh', 'en']) {
		const slug = `${name}${l === 'zh' ? '' : '-en'}`;
		const htmlPath = path.join(tmp, `${slug}.html`);
		const pngPath = path.join(tmp, `${slug}.png`);
		const webpPath = path.join(OUT, `${slug}.webp`);
		fs.writeFileSync(htmlPath, fn(l));
		execFileSync(
			CHROME,
			[
				'--headless=new',
				'--disable-gpu',
				'--hide-scrollbars',
				'--force-device-scale-factor=1',
				`--window-size=${w},${h}`,
				`--screenshot=${pngPath}`,
				`file://${htmlPath}`,
			],
			{stdio: 'pipe'},
		);
		execFileSync('cwebp', ['-quiet', '-q', '86', pngPath, '-o', webpPath]);
		const kb = (fs.statSync(webpPath).size / 1024).toFixed(0);
		console.log(`✓ ${slug}.webp (${w}x${h}, ${kb} KB)`);
	}
}

fs.rmSync(tmp, {recursive: true, force: true});
