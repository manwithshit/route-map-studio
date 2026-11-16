// 自建底图：OpenFreeMap 的 OpenMapTiles 矢量瓦片 + 主题配色（见 themes.ts）。
// 底图不放任何文字图层，避免逐帧的标注碰撞重排造成闪烁；地标文字由我们自己的图层绘制。
import * as turf from '@turf/turf';
import type {LayerSpecification, StyleSpecification} from 'maplibre-gl';
import {alpha, type Theme} from './themes';
import type {Timeline} from './timeline';

// 锁定瓦片版本，保证重复渲染拿到同一份数据
const TILES = 'https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf';

const byZoom = (pairs: number[]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...pairs] as any;
const classIn = (classes: string[]) => ['match', ['get', 'class'], classes, true, false] as any;

// 地面网格：路线包围盒外扩 3km，约 240m 一格
const gridLines = (route: Timeline['route']) => {
	const [w, s, e, n] = turf.bbox(route);
	const pad = 0.03;
	const lines = [];
	for (let x = w - pad; x <= e + pad; x += 0.0025) lines.push(turf.lineString([[x, s - pad], [x, n + pad]]));
	for (let y = s - pad; y <= n + pad; y += 0.0022) lines.push(turf.lineString([[w - pad, y], [e + pad, y]]));
	return turf.featureCollection(lines);
};

export const buildStyle = (t: Theme, tl: Timeline): StyleSpecification => {
	const lit = ['==', ['get', 'lit'], 1] as any;
	const layers: LayerSpecification[] = [
		{id: 'bg', type: 'background', paint: {'background-color': t.bg}},
		{
			id: 'residential',
			type: 'fill',
			source: 'omt',
			'source-layer': 'landuse',
			filter: classIn(['residential', 'commercial', 'retail']),
			paint: {'fill-color': t.residential, 'fill-opacity': 0.8},
		},
		{
			id: 'green',
			type: 'fill',
			source: 'omt',
			'source-layer': 'landcover',
			filter: classIn(['grass', 'wood', 'farmland']),
			paint: {'fill-color': t.green, 'fill-opacity': 0.9},
		},
		{id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: {'fill-color': t.green, 'fill-opacity': 0.9}},
		{id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: {'fill-color': t.water}},
		{
			id: 'water-edge',
			type: 'line',
			source: 'omt',
			'source-layer': 'water',
			paint: {'line-color': t.waterEdge, 'line-width': 1.2, 'line-opacity': 0.8},
		},
		{
			id: 'waterway',
			type: 'line',
			source: 'omt',
			'source-layer': 'waterway',
			paint: {'line-color': t.waterway, 'line-width': byZoom([12, 0.8, 16, 3])},
		},
	];
	if (t.grid) {
		layers.push({id: 'grid', type: 'line', source: 'grid', paint: {'line-color': t.grid, 'line-width': 1.2, 'line-opacity': 0.75}});
	}
	layers.push(
		{
			id: 'road-minor',
			type: 'line',
			source: 'omt',
			'source-layer': 'transportation',
			filter: classIn(['minor', 'service', 'track']),
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.roadMinor, 'line-width': byZoom([13, 0.4, 15, 1.2, 17, 3])},
		},
		{
			id: 'rail',
			type: 'line',
			source: 'omt',
			'source-layer': 'transportation',
			filter: classIn(['rail', 'transit']),
			paint: {'line-color': t.rail, 'line-width': byZoom([12, 0.6, 16, 1.6]), 'line-dasharray': [3, 2]},
		},
		{
			id: 'road-major-glow',
			type: 'line',
			source: 'omt',
			'source-layer': 'transportation',
			filter: classIn(['primary', 'secondary', 'tertiary', 'trunk', 'motorway']),
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.roadGlow, 'line-width': byZoom([12, 2, 15, 7, 17, 16]), 'line-blur': 4, 'line-opacity': 0.7},
		},
		{
			id: 'road-major',
			type: 'line',
			source: 'omt',
			'source-layer': 'transportation',
			filter: classIn(['primary', 'secondary', 'tertiary']),
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.roadMajor, 'line-width': byZoom([12, 0.7, 15, 2, 17, 5])},
		},
		{
			id: 'road-highway',
			type: 'line',
			source: 'omt',
			'source-layer': 'transportation',
			filter: classIn(['trunk', 'motorway']),
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.highway, 'line-width': byZoom([11, 1, 15, 3, 17, 7])},
		},
	);
	if (t.buildingOutline) {
		layers.push({
			id: 'building-outline',
			type: 'line',
			source: 'omt',
			'source-layer': 'building',
			minzoom: 13,
			paint: {'line-color': t.buildingOutline, 'line-width': 1, 'line-opacity': 0.55},
		});
	}
	layers.push(
		{
			id: 'buildings',
			type: 'fill-extrusion',
			source: 'omt',
			'source-layer': 'building',
			minzoom: 13,
			paint: {
				'fill-extrusion-color': [
					'interpolate',
					['linear'],
					['coalesce', ['get', 'render_height'], 10],
					0,
					t.building[0],
					60,
					t.building[1],
					180,
					t.building[2],
				],
				'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
				'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
				'fill-extrusion-opacity': t.buildingOpacity,
			},
		},
		// ── 路线：未行进的幽暗虚线底线 + 三层发光轨迹 ──
		{
			id: 'route-ghost',
			type: 'line',
			source: 'route-full',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.trace[1], 'line-opacity': 0.32, 'line-width': 3, 'line-dasharray': [1.2, 1.6]},
		},
		{
			id: 'trace-halo',
			type: 'line',
			source: 'trace',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.halo, 'line-width': 34, 'line-blur': 22, 'line-opacity': 0.32},
		},
		{
			id: 'trace-glow',
			type: 'line',
			source: 'trace',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {'line-color': t.trace[1], 'line-width': 13, 'line-blur': 5, 'line-opacity': 0.7},
		},
		{
			id: 'trace-core',
			type: 'line',
			source: 'trace',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {
				'line-width': 4.5,
				'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, t.trace[0], 0.55, t.trace[1], 0.92, t.trace[2], 1, t.trace[3]],
			},
		},
		// ── 流光：沿已行进轨迹循环奔跑的亮段，尾部渐隐 ──
		{
			id: 'flow-glow',
			type: 'line',
			source: 'flow',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {
				'line-width': 16,
				'line-blur': 8,
				'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, alpha(t.trace[2], 0), 1, alpha(t.trace[2], 0.9)],
			},
		},
		{
			id: 'flow-core',
			type: 'line',
			source: 'flow',
			layout: {'line-cap': 'round', 'line-join': 'round'},
			paint: {
				'line-width': 5,
				'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,255,255,0)', 0.7, alpha(t.trace[3], 0.8), 1, '#ffffff'],
			},
		},
		// ── 地标：到达时点亮 + 冲击波 ──
		{
			id: 'stop-burst',
			type: 'circle',
			source: 'stops',
			paint: {
				'circle-radius': ['get', 'br'],
				'circle-color': 'rgba(0,0,0,0)',
				'circle-stroke-color': t.accent,
				'circle-stroke-width': 3,
				'circle-stroke-opacity': ['get', 'bo'],
				'circle-pitch-alignment': 'map',
			},
		},
		{
			id: 'stop-dot',
			type: 'circle',
			source: 'stops',
			paint: {
				'circle-radius': 8,
				'circle-color': ['case', lit, t.accent, t.stopIdle],
				'circle-stroke-color': ['case', lit, '#ffffff', alpha(t.trace[1], 0.6)],
				'circle-stroke-width': 2.5,
				'circle-pitch-alignment': 'map',
			},
		},
		{
			id: 'stop-label',
			type: 'symbol',
			source: 'stops',
			layout: {
				'text-field': ['get', 'name'],
				'text-font': ['Noto Sans Bold'],
				'text-size': 30,
				'text-anchor': ['get', 'anchor'],
				'text-offset': [
					'match',
					['get', 'anchor'],
					'left',
					['literal', [0.9, 0]],
					'right',
					['literal', [-0.9, 0]],
					'top',
					['literal', [0, 0.9]],
					['literal', [0, -0.9]],
				],
				'text-allow-overlap': true,
				'text-ignore-placement': true,
			},
			paint: {
				'text-color': ['case', lit, '#ffffff', `rgba(${t.ink},0.75)`],
				'text-opacity': ['get', 'lo'],
				'text-halo-color': `rgba(${t.bgRgb},0.9)`,
				'text-halo-width': 2.5,
			},
		},
		// ── 车头：贴地呼吸波纹 + 发光核心 ──
		{
			id: 'head-ring',
			type: 'circle',
			source: 'head',
			filter: ['==', ['get', 'kind'], 'ring'],
			paint: {
				'circle-radius': ['get', 'rr'],
				'circle-color': alpha(t.head, 0.08),
				'circle-stroke-color': t.head,
				'circle-stroke-width': 2.5,
				'circle-stroke-opacity': ['get', 'ro'],
				'circle-opacity': ['get', 'ro'],
				'circle-pitch-alignment': 'map',
			},
		},
		{
			id: 'head-glow',
			type: 'circle',
			source: 'head',
			filter: ['==', ['get', 'kind'], 'core'],
			paint: {'circle-radius': 26, 'circle-color': t.head, 'circle-opacity': 0.45, 'circle-blur': 1},
		},
		{
			id: 'head-core',
			type: 'circle',
			source: 'head',
			filter: ['==', ['get', 'kind'], 'core'],
			paint: {'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': t.head, 'circle-stroke-width': 3.5},
		},
	);

	return {
		version: 8,
		glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
		sources: {
			omt: {
				type: 'vector',
				tiles: [TILES],
				minzoom: 0,
				maxzoom: 14,
				attribution: '© OpenMapTiles © OpenStreetMap contributors',
			},
			grid: {type: 'geojson', data: gridLines(tl.route)},
			'route-full': {type: 'geojson', data: tl.route},
			trace: {type: 'geojson', data: tl.route, lineMetrics: true},
			flow: {type: 'geojson', data: {type: 'FeatureCollection', features: []}, lineMetrics: true},
			head: {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
			stops: {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
		},
		sky: {
			'sky-color': t.sky.sky,
			'horizon-color': t.sky.horizon,
			'fog-color': t.sky.fog,
			'sky-horizon-blend': 0.6,
			'horizon-fog-blend': 0.7,
			'fog-ground-blend': 0.55,
			'atmosphere-blend': 0,
		},
		light: {anchor: 'map', position: [1.4, 210, 35], color: t.light, intensity: 0.32},
		layers,
	};
};
