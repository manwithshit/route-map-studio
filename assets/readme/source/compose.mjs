// 生成 README 里的封面、风格墙、画幅图。素材全部是真实成片抽帧。
// 用法：FRAMES=/path/to/frames OUT=/path/to/out node compose.mjs（需要 puppeteer-core 和本机 Chrome）
// FRAMES 目录里需要：v1_3.5.jpg、v1_8.3.jpg（成都 9:16）、v2_6.5.jpg、v2_9.0.jpg（重庆 9:16）、
// 3x4_8.2.jpg、16x9_9.0.jpg，以及 6 张主题帧 <主题>-205.jpg。导出 PNG 后用 cwebp -q 84 转 WebP。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const FRAMES = process.env.FRAMES ?? '/tmp/rms_assets/new';
const OUT = process.env.OUT ?? '/tmp/rms_assets/out';
const F = `file://${FRAMES}/`;
const SANS = '"SF Pro Display","PingFang SC","Helvetica Neue",sans-serif';
const MONO = '"SF Mono",Menlo,monospace';
const base = (w,h,body,css='') => `<!doctype html><meta charset=utf-8><style>
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#07080b;color:#eef0f4;font-family:${SANS};-webkit-font-smoothing:antialiased}
.mono{font-family:${MONO};letter-spacing:.14em;text-transform:uppercase}
.phone{position:absolute;border-radius:34px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.08),0 40px 90px rgba(0,0,0,.7)}
.phone img{width:100%;height:100%;object-fit:cover;display:block}
${css}</style><body>${body}</body>`;
const T = {
 zh:{eyebrow:'Local workbench · Remotion + MapLibre', title:'路线地图工作台', sub:['选几个地点，','渲染一条电影感的城市路线动画。'], stops:['起点','途经','终点'], meta:['6 套风格','3 种画幅','本地渲染 60fps']},
 en:{eyebrow:'Local workbench · Remotion + MapLibre', title:'Route Map Studio', sub:['Pick a few places.','Render a cinematic city route video.'], stops:['Start','Via','End'], meta:['6 themes','3 aspect ratios','Local 60fps render']},
};
const hero = (l) => { const t=T[l]; return base(2400,1060, `
<div style="position:absolute;inset:0;background:radial-gradient(900px 700px at 78% 55%,rgba(232,178,75,.16),transparent 70%),radial-gradient(700px 600px at 98% 20%,rgba(54,224,255,.10),transparent 70%)"></div>
<div style="position:absolute;left:130px;top:130px;width:1060px">
 <p class="mono" style="font-size:26px;color:#e8b24b">● ${t.eyebrow}</p>
 <h1 style="font-size:${l==='zh'?136:124}px;white-space:nowrap;font-weight:700;letter-spacing:${l==='zh'?'.02em':'-.02em'};margin-top:44px;line-height:1.05">${t.title}</h1>
 <p style="font-size:52px;line-height:1.4;color:#c9ced8;margin-top:40px;font-weight:500">${t.sub[0]}<br><span style="color:#e8b24b">${t.sub[1]}</span></p>
 <svg width="900" height="120" viewBox="0 0 900 120" style="margin-top:70px;display:block">
  <defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="886" y2="0"><stop offset="0" stop-color="#e8b24b"/><stop offset=".62" stop-color="#e8b24b"/><stop offset=".62" stop-color="#3a3f4b"/></linearGradient></defs>
  <line x1="14" y1="30" x2="886" y2="30" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/>
  ${[14,450,886].map((x,i)=>`<circle cx="${x}" cy="30" r="${i===1?12:14}" fill="${i<2?'#e8b24b':'#07080b'}" stroke="${i<2?'#e8b24b':'#6b7383'}" stroke-width="4"/><text x="${x}" y="98" font-size="30" fill="#a0a8b6" text-anchor="${i===0?'start':i===2?'end':'middle'}" font-family='${SANS}'>${t.stops[i]}</text>`).join('')}
  <circle cx="555" cy="30" r="22" fill="none" stroke="#36e0ff" stroke-width="3" opacity=".6"/><circle cx="555" cy="30" r="9" fill="#36e0ff"/>
 </svg>
 <p class="mono" style="font-size:24px;color:#7d8594;margin-top:56px">${t.meta.join('  ·  ')}</p>
</div>
<div class="phone" style="left:1290px;top:130px;width:450px;height:800px;transform:rotate(-4deg)"><img src="${F}v1_3.5.jpg"></div>
<div class="phone" style="left:1640px;top:84px;width:500px;height:889px;transform:rotate(1deg);z-index:2"><img src="${F}v2_9.0.jpg"></div>
<div class="phone" style="left:2030px;top:200px;width:420px;height:747px;transform:rotate(5deg)"><img src="${F}v1_8.3.jpg"></div>
`);};
const themes = (l) => { const names = l==='zh'?['暗夜青','赛博霓虹','黑金夜景','全息线框','工程蓝图','小红书红']:['Midnight Cyan','Cyber Neon','Black Gold','Hologram','Blueprint','Rednote Red']; const ids=['cyan','neon','gold','hologram','blueprint','xhs']; const acc=['#3fd5ff','#ff3df0','#e8b24b','#36e0ff','#5aa9ff','#ff2d55'];
 return base(2400,860, `<div style="position:absolute;left:60px;right:60px;top:56px;display:grid;grid-template-columns:repeat(6,1fr);gap:28px">${ids.map((id,i)=>`<figure><div class="phone" style="position:relative;width:100%;aspect-ratio:9/16;border-radius:24px"><img src="${F}${id}-205.jpg"></div><figcaption style="margin-top:26px;display:flex;align-items:center;gap:14px;font-size:34px;font-weight:600"><i style="width:18px;height:18px;border-radius:50%;background:${acc[i]};box-shadow:0 0 18px ${acc[i]}"></i>${names[i]}</figcaption></figure>`).join('')}</div>`);};
const aspects = (l) => { const lab = l==='zh'?['9:16 竖屏','3:4 竖图','16:9 横屏']:['9:16 vertical','3:4 portrait','16:9 landscape'];
 const item=(src,w,h,i,px)=>`<figure style="display:flex;flex-direction:column;align-items:flex-start"><div class="phone" style="position:relative;width:${w}px;height:${h}px;border-radius:22px"><img src="${F}${src}"></div><figcaption style="margin-top:26px;font-size:34px;font-weight:600">${lab[i]} <span class="mono" style="font-size:22px;color:#7d8594;margin-left:10px">${px}</span></figcaption></figure>`;
 return base(2400,1000, `<div style="position:absolute;left:80px;right:80px;bottom:70px;display:flex;align-items:flex-end;justify-content:space-between">${item('v2_6.5.jpg',450,800,0,'1080×1920')}${item('3x4_8.2.jpg',600,800,1,'1080×1440')}${item('16x9_9.0.jpg',1100,619,2,'1920×1080')}</div>`);};
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--allow-file-access-from-files']});
const p = await b.newPage();
for (const [name, fn, w, h] of [['hero',hero,2400,1060],['themes',themes,2400,860],['aspects',aspects,2400,1000]]) for (const l of ['zh','en']) {
 await p.setViewport({width:w,height:h}); const file=`${OUT}/${name}-${l}.html`; fs.writeFileSync(file, fn(l)); await p.goto('file://'+file,{waitUntil:'load'});
 await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode()))); await new Promise(r=>setTimeout(r,200));
 await p.screenshot({path:`${OUT}/${name}${l==='zh'?'':'-en'}.png`});
}
await b.close();
