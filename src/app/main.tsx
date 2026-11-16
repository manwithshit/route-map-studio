import {setWorkerUrl} from 'maplibre-gl';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

// MapLibre worker 从 public/ 提供（Vite 与 Remotion 渲染共用同一份）
setWorkerUrl('/maplibre-gl-worker.mjs');

createRoot(document.getElementById('root')!).render(<App />);
