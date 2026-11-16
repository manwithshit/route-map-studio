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

const applyFrame = (map: MLMap, s: FrameState) => {
	(map.getSource('trace') as GeoJSONSource).setData(s.trace);
	(map.getSource('flow') as GeoJSONSource).setData(s.flow);
	(map.getSource('head') as GeoJSONSource).setData(s.headFc);
	(map.getSource('stops') as GeoJSONSource).setData(s.stopsFc);
	// jumpTo 无补间：相机严格落在本帧计算值上
	map.jumpTo(s.camera);
};

// 地图层。主题、路线或画幅变化时由父组件换 key 重建。
const MapLayer: React.FC<{theme: Theme; tl: Timeline; state: FrameState; frame: number}> = ({theme, tl, state, frame}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<MLMap | null>(null);
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
			// 渲染时 2× 超采样，细路网在运动中不闪烁；工作台预览用 1× 保证流畅
			pixelRatio: getRemotionEnvironment().isRendering ? 2 : 1,
			refreshExpiredTiles: false,
			localIdeographFontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
			canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
		});
		instance.on('load', () => {
			applyFrame(instance, s0);
			instance.once('idle', () => {
				setMap(instance);
				continueRender(loadHandle);
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
		applyFrame(map, state);
		// 只在渲染时等瓦片、GeoJSON 轨迹和相机全部画完才放行截图。
		// 预览（Player）里不能这样做：连续播放时地图几乎不会进入 idle，每帧登记的
		// delayRender 句柄和 idle 监听会以 60 个/秒堆积，几分钟后一次性触发，整页卡死数十秒。
		if (!getRemotionEnvironment().isRendering) return;
		const handle = delayRender(`Map frame ${frame}`, {timeoutInMilliseconds: 60000});
		map.once('idle', () => continueRender(handle));
		map.triggerRepaint();
	}, [map, frame, state]);

	return <div ref={containerRef} style={{position: 'absolute', width: tl.layout.width, height: tl.layout.height}} />;
};

export const TravelMap: React.FC<VideoConfig> = (cfg) => {
	const frame = useCurrentFrame();
	const theme = getTheme(cfg.theme);
	const tl = getTimeline(cfg);
	const state = useMemo(() => tl.getFrameState(frame), [tl, frame]);
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
