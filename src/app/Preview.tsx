// 右侧实时预览：与渲染同一个组件，只是实时播放。可叠加小红书界面遮挡区。
// 没有路线时也按所选画幅画出空画框，让用户先看到成片的比例和尺寸。
import {Player} from '@remotion/player';
import {useEffect, useRef, useState} from 'react';
import {ASPECTS, durationFrames, outFps, type Aspect, type VideoConfig} from '../video/config';
import {getLayout} from '../video/layout';
import {TravelMap} from '../video/TravelMap';

export const Preview: React.FC<{aspect: Aspect; durationS: number; config: VideoConfig | null; message: string}> = ({aspect, durationS, config, message}) => {
	const {width, height} = ASPECTS[aspect];
	const L = getLayout(aspect);
	const box = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({w: 360, h: 640});
	const [mask, setMask] = useState(false);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const fit = () => {
			const r = el.getBoundingClientRect();
			const s = Math.min(r.width / width, r.height / height);
			setSize({w: Math.floor(width * s), h: Math.floor(height * s)});
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, [width, height]);

	// 画幅刚切换、预览配置还没跟上时，先显示空画框，避免旧画幅的画面被拉伸
	const live = config && config.aspect === aspect ? config : null;

	return (
		<div className="preview">
			<div className="preview-bar">
				<span className="small">
					<b>{ASPECTS[aspect].label}</b>
					<span className="muted">
						{' '}
						· {width}×{height} · {durationS.toFixed(1)} 秒{live ? ' · 实时预览' : ''}
					</span>
				</span>
				{L.safeZones.length ? (
					<label className="check">
						<input id="mask" type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} />
						显示竖屏遮挡区
					</label>
				) : null}
			</div>
			<div className="stage" ref={box}>
				<div className={`frame ${live ? '' : 'blank'}`} style={{width: size.w, height: size.h}}>
					{live ? (
						<Player
							component={TravelMap}
							inputProps={live}
							durationInFrames={durationFrames(live)}
							fps={outFps(live)}
							compositionWidth={width}
							compositionHeight={height}
							style={{width: size.w, height: size.h}}
							controls
							loop
							autoPlay
							clickToPlay={false}
						/>
					) : (
						<div className="frame-blank">
							<b>{ASPECTS[aspect].label}</b>
							<span>
								{width} × {height}
							</span>
							<p>{message}</p>
						</div>
					)}
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
