// 左侧四个区：路线 / 风格 / 字段 / 文案
import {useState} from 'react';
import type {Issue} from '../shared/health';
import {ASPECTS, DURATION_RANGE, DYNAMICS_DEFAULT, type Aspect, type ComponentToggles, type Texts} from '../video/config';
import {THEMES} from '../video/themes';
import type {Place} from './api';
import {PlaceSearch} from './PlaceSearch';
import {emptyPoint, pointFromPlace, type RoutePoint, type WorkbenchState} from './state';

type Update = (fn: (s: WorkbenchState) => WorkbenchState) => void;

const MAX_VIAS = 5;

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
	issues: Issue[];
	onKeyError: (m: string) => void;
}> = ({s, update, routing, routeError, issues, onKeyError}) => {
	const [dragging, setDragging] = useState<string | null>(null);
	const vias = s.points.filter((p) => p.role === 'via');

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

	const addVia = () =>
		update((st) => {
			const pts = [...st.points];
			pts.splice(pts.length - 1, 0, emptyPoint('via'));
			return {...st, points: pts};
		});

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
			className={`point ${p.role} ${dragging === p.uid ? 'dragging' : ''}`}
			draggable={p.role === 'via'}
			onDragStart={(e) => {
				setDragging(p.uid);
				e.dataTransfer.effectAllowed = 'move';
			}}
			onDragEnd={() => setDragging(null)}
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
				<span className={`dot ${p.role}`} />
			</div>
			<div className="point-body">
				<div className="point-top">
					<label className="point-label" htmlFor={`pt-${p.uid}`}>
						{p.role === 'via' ? <span className="grip" title="拖动排序" aria-hidden>⋮⋮</span> : null}
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
					placeholder={p.role === 'start' ? '搜索起点' : p.role === 'end' ? '搜索终点' : '搜索途经点'}
					onSelect={(place: Place) => setPoint(p.uid, (x) => pointFromPlace(x, place))}
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
				<input id="city" value={s.city} onChange={(e) => update((st) => ({...st, city: e.target.value}))} placeholder="例如：成都" />
			</label>
			<div className="points">
				{row(s.points[0], '起点')}
				{vias.map((v, i) =>
					row(
						v,
						`途经点 ${i + 1}`,
						<span className="point-tools">
							<button type="button" className="icon" aria-label="上移" disabled={i === 0} onClick={() => moveVia(v.uid, i - 1)}>
								↑
							</button>
							<button type="button" className="icon" aria-label="下移" disabled={i === vias.length - 1} onClick={() => moveVia(v.uid, i + 1)}>
								↓
							</button>
							<button type="button" className="icon" aria-label="删除途经点" onClick={() => removeVia(v.uid)}>
								×
							</button>
						</span>,
					),
				)}
				{row(s.points[s.points.length - 1], '终点')}
			</div>
			<div className="row">
				<button type="button" className="btn ghost small" onClick={addVia} disabled={vias.length >= MAX_VIAS}>
					＋ 添加途经点
				</button>
				<button type="button" className="btn ghost small" onClick={swapEnds}>
					⇅ 起终点互换
				</button>
			</div>
			<div className={`route-status ${routing}`}>
				{routing === 'loading' ? '正在算路…' : routing === 'error' ? routeError : `全程 ${km} 公里 · 沿真实道路`}
			</div>
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
export const StylePanel: React.FC<{s: WorkbenchState; update: Update}> = ({s, update}) => (
	<Section title="风格">
		<div className="themes" role="radiogroup" aria-label="主题">
			{Object.values(THEMES).map((t) => (
				<button
					key={t.id}
					type="button"
					role="radio"
					aria-checked={s.theme === t.id}
					className={`theme ${s.theme === t.id ? 'on' : ''}`}
					onClick={() => update((st) => ({...st, theme: t.id}))}
				>
					<img src={`/themes/${t.id}.jpg`} alt="" loading="lazy" />
					<span className="theme-name">
						<i style={{background: t.accent}} />
						{t.label}
					</span>
				</button>
			))}
		</div>
	</Section>
);

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
