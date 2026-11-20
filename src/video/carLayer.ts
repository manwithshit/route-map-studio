// 3D 小车图层：用 three.js 在 MapLibre 的同一个 WebGL 上下文里画一个 glTF 模型。
// 车的位置和朝向每帧由时间轴给出（与轨迹、镜头同一份数据），这里只负责摆放和绘制。
// 模型是用 Tripo 生成的 Q 版玩具车（public/models/toy-car.glb）。
import {MercatorCoordinate, type CustomLayerInterface} from 'maplibre-gl';
import {staticFile} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export const CAR_LAYER_ID = 'head-car-3d';
// 车长按屏幕像素定，不按真实米数：镜头拉远拉近车都一样大，像贴在地图上的玩具。
// MapLibre 的世界宽度是 512 × 2^zoom 像素，墨卡托坐标里整个世界是 1。
const CAR_PX = 168;

// 模型只加载一次，所有地图实例共用。归一化成：车头朝 +Y（正北）、Z 轴朝上、车底贴地、车长 1。
let modelPromise: Promise<THREE.Group> | null = null;
export const loadCarModel = () =>
	(modelPromise ??= new GLTFLoader()
		.loadAsync(staticFile('models/toy-car.glb'))
		.then((gltf) => {
			const root = gltf.scene;
			const box = new THREE.Box3().setFromObject(root);
			const size = box.getSize(new THREE.Vector3());
			const center = box.getCenter(new THREE.Vector3());
			root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
			const wrap = new THREE.Group();
			wrap.add(root);
			wrap.scale.setScalar(1 / Math.max(size.x, size.z));
			// glTF 是 Y 轴朝上、这个模型车头朝 +X：先绕 Y 转到车头朝 −Z，再绕 X 转成 Z 轴朝上、车头朝 +Y
			wrap.rotation.set(Math.PI / 2, size.x > size.z ? Math.PI / 2 : 0, 0);
			const out = new THREE.Group();
			out.add(wrap);
			return out;
		})
		.catch((e) => {
			modelPromise = null;
			throw e;
		}));

export type CarLayer = CustomLayerInterface & {setPose: (lngLat: [number, number], heading: number) => void};

export const createCarLayer = (model: THREE.Group): CarLayer => {
	let renderer: THREE.WebGLRenderer;
	let map: Parameters<NonNullable<CustomLayerInterface['onAdd']>>[0];
	const scene = new THREE.Scene();
	const camera = new THREE.Camera();
	const car = model.clone(true);
	let pose: {lngLat: [number, number]; heading: number} | null = null;
	// 柔和的全局光 + 一盏斜上方的主光，玩具车有体积但不反光发亮
	scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c4a5, 3.2));
	const sun = new THREE.DirectionalLight(0xffffff, 2.2);
	sun.position.set(-0.6, -0.8, 1.4);
	scene.add(sun);
	scene.add(car);

	return {
		id: CAR_LAYER_ID,
		type: 'custom',
		renderingMode: '3d', // 和楼块共用深度缓冲，楼挡住车时车会被遮住
		setPose(lngLat, heading) {
			pose = {lngLat, heading};
		},
		onAdd(m, gl) {
			map = m;
			renderer = new THREE.WebGLRenderer({canvas: m.getCanvas(), context: gl, antialias: true});
			renderer.autoClear = false;
			renderer.outputColorSpace = THREE.SRGBColorSpace;
		},
		onRemove() {
			renderer?.dispose();
		},
		render(_gl, args) {
			if (!pose) return;
			const mc = MercatorCoordinate.fromLngLat(pose.lngLat, 0);
			const s = CAR_PX / (512 * 2 ** map.getZoom());
			// 墨卡托坐标 y 朝南，所以 y 轴取反；时间轴的朝向是从正北顺时针，绕 Z 轴是逆时针，取负
			const model = new THREE.Matrix4()
				.makeTranslation(mc.x, mc.y, mc.z)
				.scale(new THREE.Vector3(s, -s, s))
				.multiply(new THREE.Matrix4().makeRotationZ((-pose.heading * Math.PI) / 180));
			camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
			renderer.resetState();
			renderer.render(scene, camera);
		},
	};
};
