// 右侧实时预览：与渲染同一个组件，只是实时播放。可叠加小红书界面遮挡区。
import {Player} from '@remotion/player';
import {useEffect, useRef, useState} from 'react';
import {ASPECTS, durationFrames, FPS, type VideoConfig} from '../video/config';
import {getLayout} from '../video/layout';
import {TravelMap} from '../video/TravelMap';

export const Preview: React.FC<{config: VideoConfig}> = ({config}) => {
	const {width, height} = ASPECTS[config.aspect];
	const L = getLayout(config.aspect);
	const box = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({w: 360, h: 640});
	const [mask, setMask] = useState(false);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			const r = el.getBoundingClientRect();
			const s = Math.min(r.width / width, r.height / height);
			setSize({w: Math.floor(width * s), h: Math.floor(height * s)});
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [width, height]);

	return (
		<div className="preview">
			<div className="preview-bar">
				<span className="muted small">
					实时预览 · {width}×{height} · {config.durationS.toFixed(1)} 秒
				</span>
				{L.safeZones.length ? (
					<label className="check">
						<input id="mask" type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} />
						显示小红书遮挡区
					</label>
				) : null}
			</div>
			<div className="stage" ref={box}>
				<div className="frame" style={{width: size.w, height: size.h}}>
					<Player
						component={TravelMap}
						inputProps={config}
						durationInFrames={durationFrames(config)}
						fps={FPS}
						compositionWidth={width}
						compositionHeight={height}
						style={{width: size.w, height: size.h}}
						controls
						loop
						autoPlay
						clickToPlay={false}
					/>
					{mask
						? L.safeZones.map((z) => (
								<div
									key={z.label}
									className="safe-zone"
									style={{left: `${(z.x / width) * 100}%`, top: `${(z.y / height) * 100}%`, width: `${(z.w / width) * 100}%`, height: `${(z.h / height) * 100}%`}}
								>
									<span>{z.label}</span>
								</div>
							))
						: null}
				</div>
			</div>
		</div>
	);
};
