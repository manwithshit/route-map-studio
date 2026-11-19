import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {checkRoute} from '../shared/health';
import {SAMPLES} from '../samples';
import type {LngLat, VideoConfig} from '../video/config';
import {THEMES} from '../video/themes';
import {api, type Job} from './api';
import {KeyGate} from './KeyGate';
import {RenderButton} from './RenderButton';
import {FieldsPanel, RoutePanel, StylePanel, TextsPanel} from './Panels';
import {Preview} from './Preview';
import {cityConflict, defaultTexts, loadState, pointsKey, sampleState, saveState, toVideoConfig, withDefaultTexts, type WorkbenchState} from './state';

export const App: React.FC = () => {
	const [s, setS] = useState<WorkbenchState>(loadState);
	const [key, setKey] = useState<{hasKey: boolean; masked: string; outputDir: string} | null>(null);
	const [gate, setGate] = useState(false);
	const [routing, setRouting] = useState<'idle' | 'loading' | 'error'>('idle');
	const [routeError, setRouteError] = useState('');
	const [job, setJob] = useState<Job | null>(null);
	const [renderError, setRenderError] = useState('');

	const update = useCallback((fn: (st: WorkbenchState) => WorkbenchState) => setS((st) => fn(st)), []);

	useEffect(() => {
		api
			.config()
			.then((c) => {
				setKey({hasKey: c.hasKey, masked: c.keyMasked, outputDir: c.outputDir});
				if (!c.hasKey) setGate(true);
			})
			.catch(() => setKey({hasKey: false, masked: '', outputDir: ''}));
	}, []);

	useEffect(() => saveState(s), [s]);

	// 路线点变化 → 自动重新算路（防抖）
	// 途经点可不填：没选地点的途经点不参与算路，只有起点和终点是必选
	const wantKey = pointsKey(s.points);
	const allPicked = Boolean(s.points[0].place && s.points[s.points.length - 1].place);
	const conflict = cityConflict(s.points);
	useEffect(() => {
		if (!allPicked || conflict || wantKey === s.routeKey) return;
		setRouting('loading');
		const timer = setTimeout(async () => {
			try {
				const r = await api.route(s.points.filter((p) => p.place).map((p) => p.place!.lngLat as LngLat));
				setS((st) => withDefaultTexts({...st, route: r, routeKey: wantKey}));
				setRouting('idle');
			} catch (e) {
				setRouteError(e instanceof Error ? e.message : String(e));
				setRouting('error');
			}
		}, 350);
		return () => clearTimeout(timer);
	}, [wantKey, allPicked, conflict, s.routeKey, s.points]);

	// 地标勾选变化时同步默认摘要
	const landmarkSig = s.points.map((p) => `${p.landmark}${p.name}`).join('|');
	useEffect(() => {
		setS((st) => withDefaultTexts(st));
	}, [landmarkSig]);

	const config = useMemo(() => toVideoConfig(s), [s]);
	// 预览直接用当前配置：useDeferredValue 会被 Player 每帧的更新一直打断，改文案和开关要等很久才生效
	const previewConfig = config;

	const issues = useMemo(() => {
		if (!config) return [];
		return checkRoute({
			coordinates: config.route.coordinates as LngLat[],
			distanceMeters: config.route.distanceMeters,
			durationS: config.durationS,
			landmarks: config.landmarks,
		});
	}, [config]);
	// 预览和渲染都只用“已算好的路线”。路线点没选全、跨城市、正在算路或路线已过期时，不能渲染
	// 有硬性错误（太短、太长）的路线不进预览：几百公里的路线会让地图每帧加载新瓦片，整页卡死
	const routeBroken = issues.find((i) => i.level === 'error')?.message ?? '';
	const stale = wantKey !== s.routeKey;
	const blocked = issues.some((i) => i.level === 'error') || !config || routing === 'loading' || !allPicked || Boolean(conflict) || stale;
	const blockReason = !allPicked
		? '起点和终点都要从搜索候选里选好，途经点可以不填。'
		: conflict
			? '路线点不在同一个城市，先改好再渲染。'
			: routing === 'loading' || stale
				? '正在按新的路线点算路…'
				: issues.some((i) => i.level === 'error')
					? '路线有问题，看左侧路线区的提示。'
					: '';

	// 渲染进度轮询
	const poll = useRef<ReturnType<typeof setInterval> | null>(null);
	// 记下渲染时用的参数：渲染完成后再改参数，预览会马上变，但已保存的视频不会，要提示用户重新渲染
	const sig = useMemo(() => JSON.stringify(config), [config]);
	const [renderedSig, setRenderedSig] = useState('');
	const [renderedCfg, setRenderedCfg] = useState<VideoConfig | null>(null);
	const outdated = job?.status === 'done' && renderedSig !== sig;
	const startRender = async () => {
		if (!config) return;
		setRenderError('');
		try {
			const j = await api.render(config);
			setRenderedSig(sig);
			setRenderedCfg(config);
			setJob(j);
			poll.current = setInterval(async () => {
				try {
					const cur = await api.job(j.id);
					setJob(cur);
					if (cur.status === 'done' || cur.status === 'error') {
						if (poll.current) clearInterval(poll.current);
						if (cur.status === 'error') setRenderError(cur.error ?? '渲染失败');
					}
				} catch {
					/* 下一轮再试 */
				}
			}, 700);
		} catch (e) {
			setRenderError(e instanceof Error ? e.message : String(e));
		}
	};
	useEffect(() => () => void (poll.current && clearInterval(poll.current)), []);

	const rendering = job && (job.status === 'bundling' || job.status === 'rendering');
	// 渲染完成后外圈变绿停留一下再消失
	const [flash, setFlash] = useState(false);
	useEffect(() => {
		if (job?.status !== 'done') return;
		setFlash(true);
		const t = setTimeout(() => setFlash(false), 1600);
		return () => clearTimeout(t);
	}, [job?.status, job?.id]);
	const ringPhase = rendering ? (job!.status as 'bundling' | 'rendering') : flash ? 'done' : null;
	// 渲染时可以继续改参数、看别的风格；这时按钮置灰，旁边写明正在渲染的是哪一版
	const viewingOther = Boolean(rendering) && renderedSig !== sig;
	const renderingWhat = renderedCfg ? `${THEMES[renderedCfg.theme]?.label ?? renderedCfg.theme} · ${renderedCfg.aspect} · ${renderedCfg.texts.title1}${renderedCfg.texts.title2}` : '';

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<span className="logo" aria-hidden>
						◢
					</span>
					<b>路线地图工作台</b>
				</div>
				<div className="row">
					<label className="sample">
						<span className="muted small">载入示例</span>
						<select
							id="sample"
							value=""
							onChange={(e) => {
								if (e.target.value) setS((st) => ({...sampleState(e.target.value), fps: st.fps}));
							}}
						>
							<option value="">选择…</option>
							{SAMPLES.map((x) => (
								<option key={x.id} value={x.id}>
									{x.label}
								</option>
							))}
						</select>
					</label>
					<button type="button" className="btn ghost small" onClick={() => setGate(true)}>
						高德 Key：{!key ? '读取中…' : key.hasKey ? key.masked : '未填写'}
					</button>
				</div>
			</header>

			<main className="body">
				<div className="side">
					<RoutePanel s={s} update={update} routing={routing} routeError={routeError} conflict={conflict} issues={issues} onKeyError={() => setGate(true)} />
					<StylePanel s={s} update={update} renderingTheme={rendering ? renderedCfg?.theme : undefined} />
					<FieldsPanel s={s} update={update} />
					<TextsPanel
						s={s}
						update={update}
						onReset={() =>
							setS((st) => ({...st, texts: {...st.texts, ...defaultTexts(st.points)}, edited: {...st.edited, title1: false, title2: false, via: false}}))
						}
					/>
				</div>

				<div className="main">
					<Preview
						aspect={s.aspect}
						durationS={s.durationS}
						config={routeBroken || !allPicked ? null : previewConfig}
						message={routeBroken || (allPicked ? '正在算路…' : '选好起点和终点后，这里开始预览')}
					/>
					<div className="render">
						<div className="render-info">
							{rendering ? (
								<span className="render-what small">
									{renderedCfg ? <img src={`/themes/${renderedCfg.theme}.jpg`} alt="" /> : null}
									<span>
										<span className="render-what-name">正在渲染：{renderingWhat}</span>
										<br />
										<span className="muted">
											{viewingOther
												? '你现在看的是另一版，等这条渲染完才能渲染它。'
												: job!.status === 'bundling'
													? '首次渲染要先打包工程，大约 20 秒…'
													: '按钮外圈走满一圈就渲染好了，约 1–2 分钟'}
										</span>
									</span>
								</span>
							) : outdated && !blockReason ? (
								<span className="small warn-text">参数改过了：预览已经是新效果，但已保存的视频还是改之前的。要新视频，点「重新渲染」。</span>
							) : job?.status === 'done' && job.output ? (
								<span className="done">
									已保存：{job.output.split('/').slice(-2).join('/')}
									<button type="button" className="link" onClick={() => api.reveal(job.output!)}>
										在 Finder 中显示
									</button>
								</span>
							) : renderError ? (
								<span className="alert error inline">{renderError}</span>
							) : blockReason ? (
								<span className="muted small">{blockReason}</span>
							) : (
								<span className="muted small">预览只是播放，不会生成文件。点「渲染视频」才开始渲染，保存到桌面的「路线视频」文件夹，约 1–2 分钟。</span>
							)}
						</div>
						<RenderButton
							label={job?.status === 'bundling' ? '准备中…' : rendering ? `渲染中 ${Math.round(job!.progress * 100)}%` : outdated ? '重新渲染' : '渲染视频'}
							disabled={blocked}
							phase={ringPhase}
							dimmed={viewingOther}
							progress={job?.progress ?? 0}
							onClick={startRender}
						/>
					</div>
				</div>
			</main>

			{gate && key ? (
				<KeyGate
					current={key.hasKey ? key.masked : undefined}
					onCancel={key.hasKey ? () => setGate(false) : undefined}
					onCleared={() => setKey({...key, hasKey: false, masked: ''})}
					onDone={(masked) => {
						setKey({...key, hasKey: true, masked});
						setGate(false);
					}}
				/>
			) : null}
		</div>
	);
};
