// Remotion 渲染入口（服务端 bundle 用）。工作台预览走 src/app，直接复用 TravelMap 组件。
import {setWorkerUrl} from 'maplibre-gl';
import {registerRoot, staticFile} from 'remotion';
import {Root} from './Root';

setWorkerUrl(staticFile('maplibre-gl-worker.mjs'));
registerRoot(Root);
