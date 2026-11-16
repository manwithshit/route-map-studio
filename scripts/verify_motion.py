"""逐帧核验：镜头运动平滑度 + 车头/轨迹同步。

用法：python3 scripts/verify_motion.py out/final-travel-map.mp4 [--head-x 540 --head-y 1190]

1. 运动平滑度：对地图区域（避开 HUD）做 Farneback 光流，取每帧中位位移向量。
   平滑运镜的位移曲线连续；抖动表现为相邻帧位移的二阶差分（jerk）尖峰。
   报告 jerk 的中位数、P99、最大值，以及 jerk 相对当帧位移的比例。
2. 车头锁定（仅新版）：贴地穿行段车头应钉在画面固定点。逐帧找白色车头核心的质心，
   报告其相对期望位置的偏移；再检查车头后方 60px 内是否有亮青轨迹像素（轨迹是否追上车头）。
"""
import sys
import argparse
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--head-x", type=float, default=None)
ap.add_argument("--head-y", type=float, default=None)
ap.add_argument("--travel", type=str, default=None, help="帧区间 a:b，贴地穿行段")
ap.add_argument("--roi", type=str, default="0.05,0.30,0.85,0.80", help="x0,y0,x1,y1 比例，光流区域")
args = ap.parse_args()

cap = cv2.VideoCapture(args.video)
fps = cap.get(cv2.CAP_PROP_FPS)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
x0, y0, x1, y1 = [float(v) for v in args.roi.split(",")]
rx0, ry0, rx1, ry1 = int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)
scale = 0.5

prev = None
flows = []
heads = []
trail_ok = []
i = 0
while True:
    ok, fr = cap.read()
    if not ok:
        break
    roi = cv2.cvtColor(fr[ry0:ry1, rx0:rx1], cv2.COLOR_BGR2GRAY)
    roi = cv2.resize(roi, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    if prev is not None:
        f = cv2.calcOpticalFlowFarneback(prev, roi, None, 0.5, 4, 21, 3, 5, 1.1, 0)
        flows.append(np.median(f.reshape(-1, 2), axis=0) / scale)
    prev = roi

    if args.head_x is not None:
        cx, cy, r = int(args.head_x), int(args.head_y), 70
        patch = fr[cy - r : cy + r, cx - r : cx + r].astype(np.int32)
        b, g, rr = patch[..., 0], patch[..., 1], patch[..., 2]
        white = (b > 235) & (g > 235) & (rr > 235)
        # 只取车头核心光斑：面积 60–400px、最接近期望点的白色连通域（排除地标白字）
        n, lab, st, cen = cv2.connectedComponentsWithStats(white.astype(np.uint8), 8)
        cand = [k for k in range(1, n) if 60 <= st[k, cv2.CC_STAT_AREA] <= 400]
        if cand:
            k = min(cand, key=lambda k: np.hypot(cen[k][0] - r, cen[k][1] - r))
            heads.append((i, cen[k][0] - r, cen[k][1] - r, st[k, cv2.CC_STAT_AREA]))
        else:
            heads.append((i, np.nan, np.nan, 0))
        # 轨迹核心：高饱和亮青（B、G 高，R 低）
        cyan = (b > 200) & (g > 150) & (rr < 120)
        dist = np.hypot(*np.meshgrid(np.arange(-r, r), np.arange(-r, r)))
        ring = (dist > 22) & (dist < 60)
        trail_ok.append((i, int((cyan & ring).sum())))
    i += 1

flows = np.array(flows)
mag = np.linalg.norm(flows, axis=1)
jerk = np.linalg.norm(np.diff(flows, n=2, axis=0), axis=1)
print(f"video={args.video} {W}x{H} @ {fps:.2f}fps frames={i}")
print(f"[运动] 每帧中位位移 px: median={np.median(mag):.2f} max={mag.max():.2f}")
print(f"[运动] jerk(二阶差分) px: median={np.median(jerk):.3f} p99={np.percentile(jerk, 99):.3f} max={jerk.max():.3f}")
moving = mag[1:-1] > 1.0
if moving.any():
    rel = jerk[moving] / mag[1:-1][moving]
    print(f"[运动] jerk/位移（运动帧）: median={np.median(rel):.3f} p99={np.percentile(rel, 99):.3f}")
worst = np.argsort(jerk)[-5:][::-1]
print("[运动] jerk 最大的 5 处（帧号, jerk）:", [(int(k) + 1, round(float(jerk[k]), 2)) for k in worst])

if args.head_x is not None and args.travel:
    a, b = [int(v) for v in args.travel.split(":")]
    hs = np.array([h for h in heads if a <= h[0] <= b and not np.isnan(h[1])])
    missing = sum(1 for h in heads if a <= h[0] <= b and np.isnan(h[1]))
    dx, dy = hs[:, 1], hs[:, 2]
    print(f"[车头] 穿行段 {a}-{b}: 检出 {len(hs)} 帧, 未检出 {missing} 帧")
    print(f"[车头] 偏移 dx mean={dx.mean():+.2f} std={dx.std():.2f} | dy mean={dy.mean():+.2f} std={dy.std():.2f} | 最大 |d|={np.hypot(dx, dy).max():.2f}px")
    tr = np.array([t[1] for t in trail_ok if a <= t[0] <= b])
    zero = [t[0] for t in trail_ok if a <= t[0] <= b and t[1] == 0]
    print(f"[轨迹] 车头周围 22–60px 环内亮青像素: min={tr.min()} median={int(np.median(tr))}；为 0 的帧: {zero}")

np.save(args.video + ".flows.npy", flows)
