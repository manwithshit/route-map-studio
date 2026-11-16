// 地点搜索框：边打字边出高德候选，方向键选择，回车确认。
import {useEffect, useRef, useState} from 'react';
import {api, type Place} from './api';

export const PlaceSearch: React.FC<{
	id: string;
	city: string;
	value: Place | null;
	placeholder: string;
	onSelect: (p: Place) => void;
	onKeyError: (msg: string) => void;
}> = ({id, city, value, placeholder, onSelect, onKeyError}) => {
	const [q, setQ] = useState(value?.name ?? '');
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<Place[]>([]);
	const [active, setActive] = useState(0);
	const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
	const [msg, setMsg] = useState('');
	const typed = useRef(false);

	useEffect(() => {
		setQ(value?.name ?? '');
	}, [value?.id, value?.name]);

	useEffect(() => {
		if (!typed.current) return;
		const text = q.trim();
		if (!text) {
			setItems([]);
			return;
		}
		const ctl = new AbortController();
		const timer = setTimeout(async () => {
			setStatus('loading');
			try {
				const places = await api.search(text, city, ctl.signal);
				setItems(places.slice(0, 8));
				setActive(0);
				setStatus('idle');
				setMsg(places.length ? '' : city ? `在「${city}」没找到，换个说法或检查城市名。` : '没找到这个地点。');
			} catch (e) {
				if (ctl.signal.aborted) return;
				const m = e instanceof Error ? e.message : String(e);
				setStatus('error');
				setMsg(m);
				if (m.includes('Key')) onKeyError(m);
			}
		}, 220);
		return () => {
			ctl.abort();
			clearTimeout(timer);
		};
	}, [q, city, onKeyError]);

	const pick = (p: Place) => {
		typed.current = false;
		onSelect(p);
		setQ(p.name);
		setOpen(false);
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (!open || items.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive((a) => (a + 1) % items.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive((a) => (a - 1 + items.length) % items.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(items[active]);
		} else if (e.key === 'Escape') {
			setOpen(false);
		}
	};

	const unpicked = q.trim() !== '' && q !== value?.name;

	return (
		<div className="search">
			<input
				id={id}
				value={q}
				placeholder={placeholder}
				autoComplete="off"
				spellCheck={false}
				role="combobox"
				aria-expanded={open}
				aria-controls={`${id}-list`}
				onChange={(e) => {
					typed.current = true;
					setQ(e.target.value);
					setOpen(true);
				}}
				onFocus={() => items.length && setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 120)}
				onKeyDown={onKey}
				className={unpicked ? 'unpicked' : value ? 'picked' : ''}
			/>
			{status === 'loading' ? <span className="search-spin" aria-hidden /> : null}
			{open && (items.length > 0 || msg) ? (
				<ul className="search-list" id={`${id}-list`} role="listbox">
					{items.map((p, i) => (
						<li
							key={p.id}
							role="option"
							aria-selected={i === active}
							className={i === active ? 'active' : ''}
							onMouseDown={(e) => {
								e.preventDefault();
								pick(p);
							}}
							onMouseEnter={() => setActive(i)}
						>
							<b>{p.name}</b>
							<span>{[p.district, p.address].filter(Boolean).join(' · ')}</span>
						</li>
					))}
					{items.length === 0 && msg ? <li className="search-msg">{msg}</li> : null}
				</ul>
			) : null}
			{unpicked && !open ? <div className="hint warn">从候选里选一个，才会更新路线</div> : null}
		</div>
	);
};
