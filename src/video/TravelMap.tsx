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

// Q 版小车：俯视、车头朝上，像一张贴纸：白边、深色描边、落地阴影。按 2 倍像素画，渲染时也清晰。
// 用画布现画而不是加载图片，不需要等网络，每次渲染结果都一样。
const carImage = (t: Theme) => {
	const W = 120;
	const H = 184;
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const g = c.getContext('2d')!;
	const ink = t.traceCase ?? '#4a2e1a';
	const {body, roof} = t.car ?? {body: t.head, roof: '#ffffff'};
	const [bx, by, bw, bh, br] = [26, 20, 68, 140, 28];
	const bodyPath = () => {
		g.beginPath();
		g.roundRect(bx, by, bw, bh, [br, br, 22, 22]);
	};
	g.lineJoin = 'round';
	// 落地阴影
	g.save();
	g.filter = 'blur(6px)';
	g.fillStyle = 'rgba(70,45,20,0.32)';
	g.beginPath();
	g.roundRect(bx + 6, by + 14, bw, bh, br);
	g.fill();
	g.restore();
	// 车轮，从车身两侧露出来
	g.fillStyle = ink;
	for (const y of [42, 120]) {
		for (const x of [bx - 8, bx + bw - 6]) {
			g.beginPath();
			g.roundRect(x, y, 14, 30, 6);
			g.fill();
		}
	}
	// 白边 → 描边 → 车身 → 高光
	bodyPath();
	g.strokeStyle = '#ffffff';
	g.lineWidth = 14;
	g.stroke();
	bodyPath();
	g.strokeStyle = ink;
	g.lineWidth = 5;
	g.stroke();
	bodyPath();
	g.fillStyle = body;
	g.fill();
	g.save();
	bodyPath();
	g.clip();
	g.fillStyle = 'rgba(255,255,255,0.28)';
	g.beginPath();
	g.roundRect(bx + 8, by + 6, 14, bh - 20, 7);
	g.fill();
	g.restore();
	// 前挡风玻璃和反光
	g.beginPath();
	g.moveTo(bx + 12, by + 48);
	g.lineTo(bx + bw - 12, by + 48);
	g.lineTo(bx + bw - 7, by + 70);
	g.lineTo(bx + 7, by + 70);
	g.closePath();
	g.fillStyle = '#d9f3ff';
	g.fill();
	g.strokeStyle = ink;
	g.lineWidth = 3.5;
	g.stroke();
	g.fillStyle = 'rgba(255,255,255,0.8)';
	g.beginPath();
	g.moveTo(bx + 18, by + 52);
	g.lineTo(bx + 28, by + 52);
	g.lineTo(bx + 22, by + 66);
	g.lineTo(bx + 13, by + 66);
	g.closePath();
	g.fill();
	// 车顶、后窗
	g.beginPath();
	g.roundRect(bx + 8, by + 74, bw - 16, 40, 10);
	g.fillStyle = roof;
	g.fill();
	g.strokeStyle = ink;
	g.lineWidth = 3.5;
	g.stroke();
	g.beginPath();
	g.roundRect(bx + 11, by + 118, bw - 22, 12, 5);
	g.fillStyle = '#d9f3ff';
	g.fill();
	g.lineWidth = 3;
	g.stroke();
	// 前灯、尾灯、后视镜
	for (const x of [bx + 15, bx + bw - 15]) {
		g.beginPath();
		g.arc(x, by + 14, 7, 0, Math.PI * 2);
		g.fillStyle = '#fff3a8';
		g.fill();
		g.stroke();
	}
	g.fillStyle = '#ff4d4d';
	for (const x of [bx + 10, bx + bw - 22]) {
		g.beginPath();
		g.roundRect(x, by + bh - 9, 12, 6, 3);
		g.fill();
	}
	g.fillStyle = body;
	for (const x of [bx - 7, bx + bw - 3]) {
		g.beginPath();
		g.ellipse(x + 5, by + 58, 6, 4.5, 0, 0, Math.PI * 2);
		g.fill();
		g.stroke();
	}
	return g.getImageData(0, 0, W, H);
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
			{theme.tiltShift ? <TiltShift width={tl.layout.width} height={tl.layout.height} /> : null}
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
