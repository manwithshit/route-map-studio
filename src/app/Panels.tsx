// 左侧四个区：路线 / 风格 / 字段 / 文案
import {useEffect, useState} from 'react';
import type {Issue} from '../shared/health';
import {ASPECTS, DURATION_RANGE, DYNAMICS_DEFAULT, type Aspect, type ComponentToggles, type Texts} from '../video/config';
import {THEMES} from '../video/themes';
import type {Place} from './api';
import {PlaceSearch} from './PlaceSearch';
import {clearedRoute, emptyPoint, lockedCity, pointFromPlace, type RoutePoint, type WorkbenchState} from './state';

type Update = (fn: (s: WorkbenchState) => WorkbenchState) => void;

const MAX_VIAS = 5;

const Svg: React.FC<{children: React.ReactNode; size?: number}> = ({children, size = 14}) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
		{children}
	</svg>
);
const IconGrip = () => (
	<svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
		{[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.2" />, <circle key={`b${y}`} cx="6" cy={y} r="1.2" />])}
	</svg>
);
const IconClose = () => (
	<Svg size={12}>
		<path d="M4 4l8 8M12 4l-8 8" />
	</Svg>
);
const IconSwap = () => (
	<Svg>
		<path d="M5 2.5v11M2.5 5L5 2.5 7.5 5M11 13.5v-11M8.5 11l2.5 2.5 2.5-2.5" />
	</Svg>
);

export const Section: React.FC<{title: string; hint?: string; children: React.ReactNode}> = ({title, hint, children}) => (
	<section className="panel">
		<header className="panel-head">
			<h2>{title}</h2>
			{hint ? <span className="muted small">{hint}</span> : null}
		</header>
		{children}
	</section>
);

// ── 路线 ──
export const RoutePanel: React.FC<{
	s: WorkbenchState;
	update: Update;
	routing: 'idle' | 'loading' | 'error';
	routeError: string;
	conflict: string | null;
	issues: Issue[];
	onKeyError: (m: string) => void;
}> = ({s, update, routing, routeError, conflict, issues, onKeyError}) => {
	const [dragging, setDragging] = useState<string | null>(null);
	const [cityNote, setCityNote] = useState('');
	const vias = s.points.filter((p) => p.role === 'via');

	useEffect(() => {
		setCityNote('');
	}, [s.routeKey]);

	// 改完城市（离开输入框或回车）时，如果已选的点在别的城市，就清掉路线重选。
	// 不清的话，旧城市的点会把搜索锁在旧城市，新城市的候选全是灰的。
	const commitCity = () => {
		const want = s.city.trim().replace(/市$/, '');
		const had = lockedCity(s.points, '');
		const old = had?.name.replace(/市$/, '') ?? '';
		if (!want || !had || old.startsWith(want) || want.startsWith(old)) return;
		update((st) => clearedRoute(st));
		setCityNote(`已换到${want}，原来${old}的路线点清掉了，重新选起点和终点就行。`);
	};

	const setPoint = (uid: string, fn: (p: RoutePoint) => RoutePoint) =>
		update((st) => ({...st, points: st.points.map((p) => (p.uid === uid ? fn(p) : p))}));

	const moveVia = (uid: string, to: number) =>
		update((st) => {
			const start = st.points[0];
			const end = st.points[st.points.length - 1];
			const vs = st.points.slice(1, -1);
			const from = vs.findIndex((p) => p.uid === uid);
			if (from < 0 || to < 0 || to >= vs.length || from === to) return st;
			const [it] = vs.splice(from, 1);
			vs.splice(to, 0, it);
			return {...st, points: [start, ...vs, end]};
		});

	const addVia = () => {
		const p = emptyPoint('via');
		update((st) => {
			const pts = [...st.points];
			pts.splice(pts.length - 1, 0, p);
			return {...st, points: pts};
		});
		requestAnimationFrame(() => document.getElementById(`pt-${p.uid}`)?.focus());
	};

	const removeVia = (uid: string) => update((st) => ({...st, points: st.points.filter((p) => p.uid !== uid)}));

	const swapEnds = () =>
		update((st) => {
			const pts = [...st.points];
			const a = pts[0];
			const b = pts[pts.length - 1];
			pts[0] = {...b, role: 'start'};
			pts[pts.length - 1] = {...a, role: 'end'};
			return {...st, points: pts};
		});

	const row = (p: RoutePoint, label: string, extra?: React.ReactNode) => (
		<div
			key={p.uid}
			className={`point ${p.role} ${dragging === p.uid ? 'dragging' : ''} ${dragging && dragging !== p.uid && p.role === 'via' ? 'drop-ok' : ''}`}
			// 整行只接收放下，拖动只能从左侧把手发起：整行可拖时，在输入框里按住鼠标选字会触发
			// 原生拖拽，浏览器进入拖拽状态后光标卡住、点哪里都没反应。
			onDragOver={(e) => {
				if (p.role === 'via' && dragging && dragging !== p.uid) e.preventDefault();
			}}
			onDrop={(e) => {
				e.preventDefault();
				if (dragging) moveVia(dragging, vias.findIndex((v) => v.uid === p.uid));
				setDragging(null);
			}}
		>
			<div className="point-rail">
				{p.role === 'via' ? (
					<button
						type="button"
						className="grip"
						title="拖动排序"
						aria-label={`${label}：拖动排序，或按上下方向键移动`}
						draggable
						onDragStart={(e) => {
							setDragging(p.uid);
							e.dataTransfer.effectAllowed = 'move';
							e.dataTransfer.setData('text/plain', p.uid);
						}}
						onDragEnd={() => setDragging(null)}
						onKeyDown={(e) => {
							const i = vias.findIndex((v) => v.uid === p.uid);
							const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
							if (to < 0 || to >= vias.length) return;
							e.preventDefault();
							moveVia(p.uid, to);
							requestAnimationFrame(() => (document.querySelector(`[data-grip="${p.uid}"]`) as HTMLElement | null)?.focus());
						}}
						data-grip={p.uid}
					>
						<IconGrip />
					</button>
				) : null}
				<span className={`dot ${p.role}`} />
			</div>
			<div className="point-body">
				<div className="point-top">
					<label className="point-label" htmlFor={`pt-${p.uid}`}>
						{label}
					</label>
					<label className="check" title="到达时弹出地标卡">
						<input
							id={`lm-${p.uid}`}
							type="checkbox"
							checked={p.landmark}
							onChange={(e) => setPoint(p.uid, (x) => ({...x, landmark: e.target.checked}))}
						/>
						弹地标
					</label>
					{extra}
				</div>
				<PlaceSearch
					id={`pt-${p.uid}`}
					city={s.city}
					value={p.place}
					placeholder={p.role === 'start' ? '搜索起点' : p.role === 'end' ? '搜索终点' : '搜索途经点，不填就跳过'}
					lock={lockedCity(s.points, p.uid)}
					onSelect={(place: Place) =>
						update((st) => ({
							...st,
							// 城市框为空时，用第一个选中地点所在城市填上，后续搜索都限定在这个城市
							city: st.city.trim() || place.cityName.replace(/市$/, ''),
							points: st.points.map((x) => (x.uid === p.uid ? pointFromPlace(x, place) : x)),
						}))
					}
					onKeyError={onKeyError}
				/>
			</div>
		</div>
	);

	const km = s.route ? (s.route.distanceMeters / 1000).toFixed(1) : '–';

	return (
		<Section title="路线" hint="选好点自动算路">
			<label className="field">
				<span>城市</span>
				<input
					id="city"
					value={s.city}
					onChange={(e) => {
						setCityNote('');
						update((st) => ({...st, city: e.target.value}));
					}}
					onBlur={commitCity}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commitCity();
					}}
					placeholder="例如：成都"
				/>
			</label>
			{cityNote ? <p className="muted small city-note">{cityNote}</p> : null}
			<div className="points">
				{row(s.points[0], '起点')}
				{vias.map((v, i) =>
					row(
						v,
						`途经点 ${i + 1}`,
						<button type="button" className="point-remove" title="移除" aria-label={`移除途经点 ${i + 1}`} onClick={() => removeVia(v.uid)}>
							<IconClose />
						</button>,
					),
				)}
				{vias.length < MAX_VIAS ? (
					<div className="point add">
						<div className="point-rail">
							<span className="dot add" />
						</div>
						<button type="button" className="add-via" onClick={addVia}>
							添加途经点
							<span>可选，上限 {MAX_VIAS} 个</span>
						</button>
					</div>
				) : null}
				{row(s.points[s.points.length - 1], '终点')}
			</div>
			<div className="route-actions">
				<button type="button" className="text-btn" onClick={swapEnds}>
					<IconSwap />
					起终点互换
				</button>
				<button type="button" className="text-btn" onClick={() => update(clearedRoute)}>
					清空重选
				</button>
			</div>
			{conflict ? (
				<div className="alert error">{conflict}</div>
			) : (
				<div className={`route-status ${routing}`}>
					{routing === 'loading' ? '正在算路…' : routing === 'error' ? routeError : `全程 ${km} 公里 · 沿真实道路`}
				</div>
			)}
			{issues.length ? (
				<ul className="issues">
					{issues.map((it) => (
						<li key={it.code + it.message} className={it.level}>
							{it.message}
						</li>
					))}
				</ul>
			) : null}
		</Section>
	);
};

// ── 风格 ──
const THEME_GROUPS = Object.values(THEMES).reduce<{name: string; themes: (typeof THEMES)[string][]}[]>((acc, t) => {
	const g = acc.find((x) => x.name === t.group);
	if (g) g.themes.push(t);
	else acc.push({name: t.group, themes: [t]});
	return acc;
}, []);

export const StylePanel: React.FC<{s: WorkbenchState; update: Update; renderingTheme?: string}> = ({s, update, renderingTheme}) => {
	const current = THEMES[s.theme];
	return (
		<Section title="风格" hint={`${Object.keys(THEMES).length} 套`}>
			<div role="radiogroup" aria-label="主题" className="theme-groups">
				{THEME_GROUPS.map((g) => (
					<div key={g.name} className="theme-group">
						<div className="theme-group-name">{g.name}</div>
						<div className="themes">
							{g.themes.map((t) => (
								<button
									key={t.id}
									type="button"
									role="radio"
									aria-checked={s.theme === t.id}
									title={t.desc}
									className={`theme ${s.theme === t.id ? 'on' : ''}`}
									onClick={() => update((st) => ({...st, theme: t.id}))}
								>
									<img src={`/themes/${t.id}.jpg`} alt="" loading="lazy" />
									{renderingTheme === t.id ? <span className="theme-badge">渲染中</span> : null}
									<span className="theme-name">
										<i style={{background: t.accent}} />
										{t.label}
									</span>
								</button>
							))}
						</div>
					</div>
				))}
			</div>
			{current ? <p className="muted small theme-desc">{current.desc}</p> : null}
		</Section>
	);
};

// ── 字段 ──
const TOGGLES: {key: keyof ComponentToggles; label: string}[] = [
	{key: 'title', label: '顶部标题'},
	{key: 'gpsBar', label: 'GPS 顶栏'},
	{key: 'stepper', label: '站点进度条'},
	{key: 'cards', label: '地标卡'},
	{key: 'mapLabels', label: '地图站名'},
	{key: 'flow', label: '轨迹流光'},
	{key: 'dashboard', label: '底部仪表盘'},
	{key: 'summary', label: '结尾总结卡'},
];

export const FieldsPanel: React.FC<{s: WorkbenchState; update: Update}> = ({s, update}) => (
	<Section title="字段">
		<div className="field">
			<span>画幅</span>
			<div className="seg" role="radiogroup" aria-label="画幅">
				{(Object.keys(ASPECTS) as Aspect[]).map((a) => (
					<button key={a} type="button" role="radio" aria-checked={s.aspect === a} className={s.aspect === a ? 'on' : ''} onClick={() => update((st) => ({...st, aspect: a}))}>
						{ASPECTS[a].label}
					</button>
				))}
			</div>
		</div>
		<div className="field">
			<span>帧率</span>
			<div className="seg" role="radiogroup" aria-label="帧率">
				{([60, 30] as const).map((f) => (
					<button key={f} type="button" role="radio" aria-checked={s.fps === f} className={s.fps === f ? 'on' : ''} onClick={() => update((st) => ({...st, fps: f}))}>
						{f === 60 ? '60fps 顺滑' : '30fps 快一倍'}
					</button>
				))}
			</div>
		</div>
		<label className="field">
			<span>
				时长 <b className="num">{s.durationS.toFixed(1)} 秒</b>
			</span>
			<input
				id="duration"
				type="range"
				min={DURATION_RANGE.min}
				max={DURATION_RANGE.max}
				step={DURATION_RANGE.step}
				value={s.durationS}
				onChange={(e) => update((st) => ({...st, durationS: Number(e.target.value)}))}
			/>
		</label>
		<label className="field">
			<span>
				镜头动感 <b className="num">{s.dynamics}</b>
				{s.dynamics !== DYNAMICS_DEFAULT ? (
					<button type="button" className="link" onClick={() => update((st) => ({...st, dynamics: DYNAMICS_DEFAULT}))}>
						恢复默认
					</button>
				) : (
					<span className="muted small">默认</span>
				)}
			</span>
			<input id="dynamics" type="range" min={0} max={100} step={5} value={s.dynamics} onChange={(e) => update((st) => ({...st, dynamics: Number(e.target.value)}))} />
			<span className="range-ends">
				<span>平稳：转弯时镜头几乎不转</span>
				<span>灵动：镜头紧跟路线转向</span>
			</span>
		</label>
		<div className="field">
			<span>画面组件</span>
			<div className="toggles">
				{TOGGLES.map((t) => (
					<label key={t.key} className="toggle">
						<input
							id={`show-${t.key}`}
							type="checkbox"
							checked={s.show[t.key]}
							onChange={(e) => update((st) => ({...st, show: {...st.show, [t.key]: e.target.checked}}))}
						/>
						<span>{t.label}</span>
					</label>
				))}
			</div>
			<span className="muted small">地图数据署名按许可要求始终显示。</span>
		</div>
	</Section>
);

// ── 文案 ──
export const TextsPanel: React.FC<{s: WorkbenchState; update: Update; onReset: () => void}> = ({s, update, onReset}) => {
	const setText = (k: keyof Texts, v: string) => update((st) => ({...st, texts: {...st.texts, [k]: v}, edited: {...st.edited, [k]: true}}));
	const marks = s.points.filter((p) => p.place && p.landmark);
	return (
		<Section title="文案">
			<div className="grid2">
				<label className="field">
					<span>标题前半（白字）</span>
					<input id="t-title1" value={s.texts.title1} onChange={(e) => setText('title1', e.target.value)} />
				</label>
				<label className="field">
					<span>标题后半（主题色）</span>
					<input id="t-title2" value={s.texts.title2} onChange={(e) => setText('title2', e.target.value)} />
				</label>
				<label className="field">
					<span>GPS 标签</span>
					<input id="t-badge" value={s.texts.gpsBadge} onChange={(e) => setText('gpsBadge', e.target.value)} />
				</label>
				<label className="field">
					<span>GPS 小字</span>
					<input id="t-info" value={s.texts.gpsInfo} onChange={(e) => setText('gpsInfo', e.target.value)} />
				</label>
			</div>
			{marks.length ? (
				<div className="field">
					<span>地标名称（中文 / 英文）</span>
					<div className="marks">
						{marks.map((p) => (
							<div key={p.uid} className="mark">
								<input
									id={`mk-${p.uid}`}
									aria-label="地标中文名"
									value={p.name}
									onChange={(e) => update((st) => ({...st, points: st.points.map((x) => (x.uid === p.uid ? {...x, name: e.target.value} : x))}))}
								/>
								<input
									id={`mk-en-${p.uid}`}
									aria-label="地标英文名"
									value={p.en}
									onChange={(e) => update((st) => ({...st, points: st.points.map((x) => (x.uid === p.uid ? {...x, en: e.target.value} : x))}))}
								/>
							</div>
						))}
					</div>
				</div>
			) : null}
			<label className="field">
				<span>结尾路线摘要</span>
				<input id="t-via" value={s.texts.via} onChange={(e) => setText('via', e.target.value)} />
			</label>
			<button type="button" className="link" onClick={onReset}>
				按当前路线重置标题和摘要
			</button>
		</Section>
	);
};
