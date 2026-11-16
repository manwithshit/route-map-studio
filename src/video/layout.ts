// 各画幅的 HUD 坐标与镜头取景。数值按 1080×1920 小红书竖屏标定后推到其他画幅：
// 9:16 避让顶部 0–160 / 底部 1700–1920 / 右侧 940–1080 中下段。
import {ASPECTS, type Aspect} from './config';

export type Layout = {
	width: number;
	height: number;
	side: number; // 左边距
	contentRight: number; // HUD 内容右边界（右侧互动栏左沿）
	topY: number; // 顶栏起点
	cardY: number; // 地标卡 / 总结卡顶边
	panelY: number; // 底部仪表盘顶边
	panelH: number;
	panelW: number;
	topFadeEnd: number; // 顶部压暗渐变结束位置
	bottomFadeStart: number; // 底部压暗渐变起点（距底）
	leftFade: boolean; // 横屏额外压暗左侧
	travel: {top: number; left: number}; // 穿行时相机 padding：决定车头在画面中的位置
	fit: {top: number; bottom: number; left: number; right: number}; // 收尾全景取景框
	safeZones: {x: number; y: number; w: number; h: number; label: string}[]; // 预览遮罩
};

export const getLayout = (aspect: Aspect): Layout => {
	const {width, height} = ASPECTS[aspect];
	if (aspect === '16:9') {
		const panelH = 124;
		const panelY = height - panelH - 48;
		return {
			width,
			height,
			side: 64,
			contentRight: 920,
			topY: 56,
			cardY: 268,
			panelY,
			panelH,
			panelW: 856,
			topFadeEnd: 520,
			bottomFadeStart: 340,
			leftFade: true,
			travel: {top: 120, left: 620},
			fit: {top: 110, bottom: 120, left: 700, right: 90},
			safeZones: [],
		};
	}
	const isTall = aspect === '9:16';
	const topY = isTall ? 168 : 72;
	const cardY = topY + 212;
	const panelH = 124;
	const panelY = isTall ? 1592 : height - panelH - 64;
	return {
		width,
		height,
		side: 48,
		contentRight: 940,
		topY,
		cardY,
		panelY,
		panelH,
		panelW: 940 - 20 - 48,
		topFadeEnd: cardY + 380,
		bottomFadeStart: height - panelY + 232,
		leftFade: false,
		travel: {top: Math.round(height * 0.24), left: 0},
		fit: {top: cardY + 180, bottom: height - panelY + 72, left: 70, right: 190},
		safeZones: isTall
			? [
					{x: 0, y: 0, w: width, h: 160, label: '小红书顶栏'},
					{x: 0, y: 1700, w: width, h: 220, label: '标题 / 评论区'},
					{x: 940, y: 900, w: 140, h: 800, label: '点赞收藏'},
				]
			: [],
	};
};
