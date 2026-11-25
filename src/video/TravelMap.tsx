import {useEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, getRemotionEnvironment, useCurrentFrame} from 'remotion';
import {Map as MLMap, type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {FPS, outFps, type VideoConfig} from './config';
import {Hud, SceneContext} from './Hud';
import {CAR_LAYER_ID, createCarLayer, loadCarModel, type CarLayer} from './carLayer';
import {buildStyle} from './mapStyle';
import {getTheme} from './themes';
import {getTimeline, routeGeometryHash, type FrameState, type Timeline} from './timeline';
import type {Theme} from './themes';

const applyFrame = (map: MLMap, s: FrameState, elevation?: number, car?: CarLayer | null) => {
	car?.setPose(s.head, s.heading);
	(map.getSource('trace') as GeoJSONSource | undefined)?.setData(s.trace);
	(map.getSource('flow') as GeoJSONSource | undefined)?.setData(s.flow);
	(map.getSource('head') as GeoJSONSource | undefined)?.setData(s.headFc);
	(map.getSource('stops') as GeoJSONSource | undefined)?.setData(s.stopsFc);
	// jumpTo 无补间：相机严格落在本帧计算值上
	map.jumpTo(elevation === undefined ? s.camera : {...s.camera, elevation});
};

// 移轴效果：上下两条带子做背景模糊，中间清晰，像微缩模型照片
const TiltShift: React.FC<{width: number; height: number}> = ({width, height}) => {
	const band = (top: boolean): React.CSSProperties => ({
		position: 'absolute',
		left: 0,
		width,
		height: height * 0.3,
		[top ? 'top' : 'bottom']: 0,
		backdropFilter: 'blur(7px) saturate(115%)',
		WebkitBackdropFilter: 'blur(7px) saturate(115%)',
		maskImage: `linear-gradient(${top ? '180deg' : '0deg'}, #000 25%, transparent 100%)`,
		WebkitMaskImage: `linear-gradient(${top ? '180deg' : '0deg'}, #000 25%, transparent 100%)`,
	});
	return (
		<>
			<div style={band(true)} />
			<div style={band(false)} />
		</>
	);
};

// 地图层。路线或画幅变化时由父组件换 key 重建；换主题只换样式，不重建地图。
const MapLayer: React.FC<{theme: Theme; tl: Timeline; state: FrameState; frame: number}> = ({theme, tl, state, frame}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<MLMap | null>(null);
	// 地形主题：镜头中心高度固定成起点的地面高度。跟着地面逐帧变会让画面上下抖，
	// 因为海拔在瓦片里是分块采样的，相邻两帧取到的高度会跳。
	const elevation = useRef<number | undefined>(undefined);
	const themeRef = useRef(theme);
	themeRef.current = theme;
	const stateRef = useRef(state);
	stateRef.current = state;
	const carRef = useRef<CarLayer | null>(null);
	// 主题要小车就加 3D 小车图层，不要就拿掉。图层放在站名下面
	const syncCar = (m: MLMap, t: Theme, model?: Awaited<ReturnType<typeof loadCarModel>>) => {
		const has = Boolean(m.getLayer(CAR_LAYER_ID));
		if (t.headIcon && !has && model) {
			carRef.current = createCarLayer(model);
			m.addLayer(carRef.current, m.getLayer('stop-label') ? 'stop-label' : undefined);
		} else if (!t.headIcon) {
			if (has) m.removeLayer(CAR_LAYER_ID);
			carRef.current = null;
		} else if (has && m.getLayer('stop-label')) {
			m.moveLayer(CAR_LAYER_ID, 'stop-label');
		}
	};
	// 地形主题：地图画完一轮后取起点地面高度，之后每帧固定用它
	const fixElevation = (m: MLMap, t: Theme) => {
		elevation.current = t.terrain ? (m.queryTerrainElevation(tl.route.geometry.coordinates[0] as [number, number]) ?? 0) : undefined;
		applyFrame(m, stateRef.current, elevation.current, carRef.current);
	};
	const [loadHandle] = useState(() => delayRender('Loading MapLibre', {timeoutInMilliseconds: 90000}));

	useEffect(() => {
		if (!containerRef.current) return;
		let cancelled = false;
		const s0 = state;
		const initTheme = theme;
		const isRendering = getRemotionEnvironment().isRendering;
		const instance = new MLMap({
			container: containerRef.current,
			style: buildStyle(initTheme, tl),
			...s0.camera,
			interactive: false,
			attributionControl: false,
			fadeDuration: 0,
			maxPitch: 70,
			centerClampedToGround: !initTheme.terrain,
			// 渲染时 2× 超采样，细路网在运动中不闪烁；工作台预览用 1× 保证流畅
			pixelRatio: isRendering ? 2 : 1,
			refreshExpiredTiles: false,
			localIdeographFontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
			canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
		});
		let settled = false;
		const finishLoad = () => {
			if (cancelled || settled) return;
			settled = true;
			setMap(instance);
			continueRender(loadHandle);
		};
		const onSecondIdle = () => finishLoad();
		const onFirstIdle = () => {
			if (cancelled) return;
			const curTheme = themeRef.current;
			if (!curTheme.terrain) {
				finishLoad();
				return;
			}
			fixElevation(instance, curTheme);
			instance.once('idle', onSecondIdle);
		};
		instance.on('load', async () => {
			try {
				// 渲染时必须等模型加载完、加进地图，再放行第一帧
				if (initTheme.headIcon) {
					const model = await loadCarModel();
					if (cancelled) return;
					if (themeRef.current.headIcon) syncCar(instance, themeRef.current, model);
				}
				if (cancelled) return;
				applyFrame(instance, stateRef.current, undefined, carRef.current);
				instance.once('idle', onFirstIdle);
			} catch (err) {
				if (cancelled) return;
				if (isRendering) {
					cancelRender(err instanceof Error ? err : new Error(`3D 小车模型加载失败：${String(err)}`));
				} else {
					console.error('3D car model load failed:', err);
					applyFrame(instance, stateRef.current, undefined, null);
					finishLoad();
				}
			}
		});
		return () => {
			cancelled = true;
			instance.off('idle', onFirstIdle);
			instance.off('idle', onSecondIdle);
			if (!settled) continueRender(loadHandle);
			// 渲染时不调用 remove()：会干扰 Remotion 的渲染生命周期。
			// 工作台预览里换画幅/路线会重建地图，必须释放旧的 WebGL 上下文。
			if (!isRendering) instance.remove();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadHandle]);

	// 换主题：在同一个地图上换样式，使用版本号与清理函数隔离快速切换时的旧异步回调。
	const [restyling, setRestyling] = useState(false);
	const shownTheme = useRef(theme);
	const styleSeq = useRef(0);
	useEffect(() => {
		if (!map || shownTheme.current === theme) return;
		shownTheme.current = theme;
		const seq = ++styleSeq.current;
		let active = true;

		map.setCenterClampedToGround(!theme.terrain);
		elevation.current = undefined;
		map.setStyle(buildStyle(theme, tl), {diff: true});
		syncCar(map, theme);
		if (theme.headIcon) {
			loadCarModel()
				.then((model) => {
					if (!active || seq !== styleSeq.current || themeRef.current !== theme) return;
					syncCar(map, theme, model);
					applyFrame(map, stateRef.current, elevation.current, carRef.current);
				})
				.catch((err) => {
					if (!active || seq !== styleSeq.current) return;
					console.error('3D car model load failed:', err);
				});
		}
		applyFrame(map, stateRef.current, undefined, carRef.current);
		setRestyling(Boolean(theme.terrain));
		const onIdle = () => {
			if (!active || seq !== styleSeq.current) return;
			fixElevation(map, theme);
			setRestyling(false);
		};
		map.once('idle', onIdle);
		return () => {
			active = false;
			map.off('idle', onIdle);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map, theme]);

	useEffect(() => {
		if (!map) return;
		applyFrame(map, state, elevation.current, carRef.current);
		// 只在渲染时等瓦片、GeoJSON 轨迹和相机全部画完才放行截图。
		// 预览（Player）里不能这样做：连续播放时地图几乎不会进入 idle，每帧登记的
		// delayRender 句柄和 idle 监听会以 60 个/秒堆积，几分钟后一次性触发，整页卡死数十秒。
		if (!getRemotionEnvironment().isRendering) return;
		const handle = delayRender(`Map frame ${frame}`, {timeoutInMilliseconds: 60000});
		let done = false;
		const onIdle = () => {
			if (done) return;
			done = true;
			continueRender(handle);
		};
		map.once('idle', onIdle);
		map.triggerRepaint();
		return () => {
			map.off('idle', onIdle);
			if (!done) {
				done = true;
				continueRender(handle);
			}
		};
	}, [map, frame, state]);

	return (
		<>
			<div ref={containerRef} style={{position: 'absolute', width: tl.layout.width, height: tl.layout.height}} />
			{theme.tiltShift ? <TiltShift width={tl.layout.width} height={tl.layout.height} /> : null}
			{/* 只在工作台预览里提示：换主题、画幅或路线时地图要重建，加载瓦片需要一两秒 */}
			{(!map || restyling) && !getRemotionEnvironment().isRendering ? (
				<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.35)'}}>
					<div style={{padding: '18px 36px', borderRadius: 999, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: tl.layout.width / 28, fontFamily: '"PingFang SC", sans-serif'}}>
						地图加载中…
					</div>
				</AbsoluteFill>
			) : null}
		</>
	);
};

export const TravelMap: React.FC<VideoConfig> = (cfg) => {
	// 换算成 60 帧时间轴上的帧号：30fps 时第 n 帧取时间轴第 2n 帧
	const frame = useCurrentFrame() * (FPS / outFps(cfg));
	const theme = getTheme(cfg.theme);
	const cached = getTimeline(cfg);
	// 时间轴按路线几何缓存，缓存里的 cfg 是第一次建它时的配置。文案和组件开关不参与缓存键，
	// 必须换成当前配置，否则改文案不生效，来回切开关还会命中旧缓存、文案“回退”。
	const tl = useMemo(() => ({...cached, cfg: {...cached.cfg, texts: cfg.texts, show: cfg.show}}), [cached, cfg.texts, cfg.show]);
	const state = useMemo(() => cached.getFrameState(frame), [cached, frame]);
	const ctx = useMemo(() => ({theme, tl}), [theme, tl]);
	// 只有画幅、路线完整几何变化才重建地图；换主题在原地图上换样式，拖时长、镜头滑块都不重建
	const mapKey = `${cfg.aspect}|${cfg.route.distanceMeters}|${routeGeometryHash(cfg.route.coordinates)}`;

	return (
		<SceneContext.Provider value={ctx}>
			<AbsoluteFill style={{backgroundColor: theme.bg}}>
				<MapLayer key={mapKey} theme={theme} tl={tl} state={state} frame={frame} />
				<Hud state={state} frame={frame} />
			</AbsoluteFill>
		</SceneContext.Provider>
	);
};
