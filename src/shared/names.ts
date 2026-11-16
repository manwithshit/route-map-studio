// 地点名默认值：去掉高德 POI 名里的括号分店信息，英文名用拼音（两字一组）。都可以在文案区改。
import {pinyin} from 'pinyin-pro';

export const cleanName = (name: string) => name.replace(/[（(][^）)]*[）)]/g, '').trim() || name;

export const defaultEn = (name: string) => {
	const syl = pinyin(cleanName(name), {toneType: 'none', type: 'array', nonZh: 'consecutive'})
		.map((s) => s.trim())
		.filter(Boolean);
	if (syl.length <= 3) return syl.join('').toUpperCase();
	const words: string[] = [];
	for (let i = 0; i < syl.length; i += 2) words.push(syl.slice(i, i + 2).join(''));
	return words.join(' ').toUpperCase();
};
