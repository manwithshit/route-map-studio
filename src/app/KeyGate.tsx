// 新手引导：高德 Web服务 Key 是必填项，没有 Key 搜不了地点。
import {useState} from 'react';
import {api} from './api';

const CONSOLE_URL = 'https://console.amap.com/dev/key/app';

export const KeyGate: React.FC<{onDone: (masked: string) => void; onCancel?: () => void; onCleared: () => void; current?: string}> = ({
	onDone,
	onCancel,
	onCleared,
	current,
}) => {
	const [key, setKey] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [confirming, setConfirming] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError('');
		try {
			const r = await api.saveKey(key.trim());
			onDone(r.keyMasked);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const clear = async () => {
		setBusy(true);
		setError('');
		try {
			await api.deleteKey();
			setConfirming(false);
			onCleared();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
			<form className="gate-card" onSubmit={submit}>
				<div className="eyebrow">第一步 · 只需做一次</div>
				<h1 id="gate-title">填入你的高德 Key</h1>
				<p className="muted">工作台用高德搜索地点、边打字边出候选。Key 只保存在这台电脑上，不会上传到别处。</p>
				<ol className="steps">
					<li>
						<b>打开高德控制台</b>，用高德账号登录。
						<a className="btn ghost small" href={CONSOLE_URL} target="_blank" rel="noreferrer">
							打开控制台 ↗
						</a>
					</li>
					<li>
						点「创建新应用」，名字随便填；再点「添加 Key」，<b>服务平台一定选「Web服务」</b>。选「Web端」的 Key 用不了。
					</li>
					<li>复制表格里「Key」那一列的 32 位字符，粘贴到下面。安全密钥不用填。</li>
				</ol>
				<label className="field">
					<span>高德 Web服务 Key</span>
					<input
						id="amap-key"
						value={key}
						onChange={(e) => setKey(e.target.value)}
						placeholder="32 位字母和数字"
						autoFocus
						spellCheck={false}
						autoComplete="off"
					/>
				</label>
				{current ? (
					<div className="key-saved">
						{confirming ? (
							<>
								<span>删掉后要重新填 Key 才能搜地点。</span>
								<button type="button" className="text-btn danger" onClick={clear} disabled={busy}>
									确认删除
								</button>
								<button type="button" className="text-btn" onClick={() => setConfirming(false)} disabled={busy}>
									算了
								</button>
							</>
						) : (
							<>
								<span>
									这台电脑上保存的 Key：<code>{current}</code>
								</span>
								<button type="button" className="text-btn danger" onClick={() => setConfirming(true)}>
									删除这个 Key
								</button>
							</>
						)}
					</div>
				) : null}
				{error ? <div className="alert error">{error}</div> : null}
				<div className="row end">
					{onCancel ? (
						<button type="button" className="btn ghost" onClick={onCancel}>
							取消{current ? `（继续用 ${current}）` : ''}
						</button>
					) : null}
					<button className="btn primary" disabled={busy || key.trim().length === 0}>
						{busy ? '正在验证…' : '验证并保存'}
					</button>
				</div>
			</form>
		</div>
	);
};
