import {useEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, getRemotionEnvironment, useCurrentFrame} from 'remotion';
import {Map as MLMap, type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {VideoConfig} from './config';
import {Hud, SceneContext} from './Hud';
import {buildStyle} from './mapStyle';
import {getTheme} from './themes';
import {getTimeline, type FrameState, type Timeline} from './timeline';
import type {Theme} from './themes';

const applyFrame = (map: MLMap, s: FrameState, elevation?: number) => {
	(map.getSource('trace') as GeoJSONSource).setData(s.trace);
	(map.getSource('flow') as GeoJSONSource).setData(s.flow);
	(map.getSource('head') as GeoJSONSource).setData(s.headFc);
	(map.getSource('stops') as GeoJSONSource).setData(s.stopsFc);
	// jumpTo 无补间：相机严格落在本帧计算值上
	map.jumpTo(elevation === undefined ? s.camera : {...s.camera, elevation});
};

// Q 版小车：俯视、车头朝上，按 2 倍像素画在画布上，渲染时和预览里一样清晰。
// 用画布现画而不是加载图片，不需要等网络，每次渲染结果都一样。
const carImage = (t: Theme) => {
	const W = 64;
	const H = 104;
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const g = c.getContext('2d')!;
	const outline = t.traceCase ?? '#3a2a1a';
	g.lineWidth = 5;
	g.strokeStyle = outline;
	// 车轮
	g.fillStyle = outline;
	for (const [x, y] of [[6, 20], [W - 16, 20], [6, H - 38], [W - 16, H - 38]]) {
		g.beginPath();
		g.roundRect(x, y, 10, 20, 4);
		g.fill();
	}
	// 车身
	g.fillStyle = t.head;
	g.beginPath();
	g.roundRect(10, 6, W - 20, H - 12, 18);
	g.fill();
	g.stroke();
	// 前挡风玻璃和车顶
	g.fillStyle = '#e8f6ff';
	g.beginPath();
	g.roundRect(17, 22, W - 34, 18, 6);
	g.fill();
	g.lineWidth = 3;
	g.stroke();
	g.fillStyle = 'rgba(255,255,255,0.55)';
	g.beginPath();
	g.roundRect(17, 46, W - 34, 30, 8);
	g.fill();
	// 车灯
	g.fillStyle = '#fff6c2';
	for (const x of [16, W - 24]) {
		g.beginPath();
		g.arc(x + 4, 12, 4, 0, Math.PI * 2);
		g.fill();
	}
	return g.getImageData(0, 0, W, H);
};

// 地图层。主题、路线或画幅变化时由父组件换 key 重建。
const MapLayer: React.FC<{theme: Theme; tl: Timeline; state: FrameState; frame: number}> = ({theme, tl, state, frame}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<MLMap | null>(null);
	// 地形主题：镜头中心高度固定成起点的地面高度。跟着地面逐帧变会让画面上下抖，
	// 因为海拔在瓦片里是分块采样的，相邻两帧取到的高度会跳。
	const elevation = useRef<number | undefined>(undefined);
	const [loadHandle] = useState(() => delayRender('Loading MapLibre', {timeoutInMilliseconds: 90000}));

	useEffect(() => {
		if (!containerRef.current) return;
		const s0 = state;
		const instance = new MLMap({
			container: containerRef.current,
			style: buildStyle(theme, tl),
			...s0.camera,
			interactive: false,
			attributionControl: false,
			fadeDuration: 0,
			maxPitch: 70,
			centerClampedToGround: !theme.terrain,
			// 渲染时 2× 超采样，细路网在运动中不闪烁；工作台预览用 1× 保证流畅
			pixelRatio: getRemotionEnvironment().isRendering ? 2 : 1,
			refreshExpiredTiles: false,
			localIdeographFontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
			canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
		});
		// 样式里用到小车图标时由地图来要，按需画一次
		instance.on('styleimagemissing', (e) => {
			if (theme.headIcon && e.id === theme.headIcon && !instance.hasImage(e.id)) instance.addImage(e.id, carImage(theme), {pixelRatio: 2});
		});
		instance.on('load', () => {
			applyFrame(instance, s0);
			instance.once('idle', () => {
				const ready = () => {
					setMap(instance);
					continueRender(loadHandle);
				};
				if (!theme.terrain) return ready();
				elevation.current = instance.queryTerrainElevation(tl.route.geometry.coordinates[0] as [number, number]) ?? 0;
				applyFrame(instance, s0, elevation.current);
				instance.once('idle', ready);
			});
		});
		return () => {
			// 渲染时不调用 remove()：会干扰 Remotion 的渲染生命周期。
			// 工作台预览里换主题会重建地图，必须释放旧的 WebGL 上下文。
			if (!getRemotionEnvironment().isRendering) instance.remove();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadHandle]);

	useEffect(() => {
		if (!map) return;
		applyFrame(map, state, elevation.current);
		// 只在渲染时等瓦片、GeoJSON 轨迹和相机全部画完才放行截图。
		// 预览（Player）里不能这样做：连续播放时地图几乎不会进入 idle，每帧登记的
		// delayRender 句柄和 idle 监听会以 60 个/秒堆积，几分钟后一次性触发，整页卡死数十秒。
		if (!getRemotionEnvironment().isRendering) return;
		const handle = delayRender(`Map frame ${frame}`, {timeoutInMilliseconds: 60000});
		map.once('idle', () => continueRender(handle));
		map.triggerRepaint();
	}, [map, frame, state]);

	return (
		<>
			<div ref={containerRef} style={{position: 'absolute', width: tl.layout.width, height: tl.layout.height}} />
			{/* 只在工作台预览里提示：换主题、画幅或路线时地图要重建，加载瓦片需要一两秒 */}
			{!map && !getRemotionEnvironment().isRendering ? (
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
	const frame = useCurrentFrame();
	const theme = getTheme(cfg.theme);
	const cached = getTimeline(cfg);
	// 时间轴按路线几何缓存，缓存里的 cfg 是第一次建它时的配置。文案和组件开关不参与缓存键，
	// 必须换成当前配置，否则改文案不生效，来回切开关还会命中旧缓存、文案“回退”。
	const tl = useMemo(() => ({...cached, cfg: {...cached.cfg, texts: cfg.texts, show: cfg.show}}), [cached, cfg.texts, cfg.show]);
	const state = useMemo(() => cached.getFrameState(frame), [cached, frame]);
	const ctx = useMemo(() => ({theme, tl}), [theme, tl]);
	// 只有影响底图样式的项（主题、画幅、路线）才重建地图；拖时长、镜头滑块不重建
	const mapKey = `${cfg.theme}|${cfg.aspect}|${cfg.route.distanceMeters}|${cfg.route.coordinates.length}`;

	return (
		<SceneContext.Provider value={ctx}>
			<AbsoluteFill style={{backgroundColor: theme.bg}}>
				<MapLayer key={mapKey} theme={theme} tl={tl} state={state} frame={frame} />
				<Hud state={state} frame={frame} />
			</AbsoluteFill>
		</SceneContext.Provider>
	);
};
