// 渲染按钮：渲染时按钮外圈画一圈进度，从左上角顺时针走满一圈就是渲染完。
// 打包阶段还没有进度，外圈是一小段绕着跑的光条；渲染完外圈变绿再淡出。
export const RenderButton: React.FC<{
	label: string;
	disabled: boolean;
	phase: 'bundling' | 'rendering' | 'done' | null;
	progress: number; // 0–1
	onClick: () => void;
}> = ({label, disabled, phase, progress, onClick}) => {
	const busy = phase === 'bundling' || phase === 'rendering';
	const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
	return (
		<span className={`render-btn ${phase ?? ''}`}>
			<button type="button" className="btn primary big" disabled={disabled || busy} aria-busy={busy} onClick={onClick}>
				{label}
			</button>
			{phase ? (
				<svg className="ring" aria-hidden="true">
					<rect className="ring-track" rx="12" pathLength={100} />
					<rect
						className={`ring-fill ${phase === 'bundling' ? 'indeterminate' : ''}`}
						rx="12"
						pathLength={100}
						style={phase === 'bundling' ? undefined : {strokeDashoffset: phase === 'done' ? 0 : 100 - pct}}
					/>
				</svg>
			) : null}
			{busy ? (
				<span className="sr-only" role="status">
					{phase === 'bundling' ? '正在打包工程' : `渲染进度 ${pct}%`}
				</span>
			) : null}
		</span>
	);
};
