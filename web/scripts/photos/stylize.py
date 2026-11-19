"""Фото машины -> игровая карточка: вырезать фон, «мультяшная» обработка (меньше цветов, контуры),
закрасить центры колёс (там значки), поставить на студийный фон с подсветкой по редкости.
usage: stylize.py <in.jpg> <rarity> <out.jpg> [flip]"""
import os, sys
os.environ.setdefault('U2NET_HOME', os.path.join(os.path.dirname(__file__), '..', 'models'))
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session

W, H = 960, 540
GLOW = {'common': (150, 165, 185), 'rare': (60, 140, 255), 'epic': (180, 90, 255), 'mythic': (255, 196, 60)}
_session = None


def cutout(rgb):
    global _session
    if _session is None:
        _session = new_session('isnet-general-use')
    rgba = np.array(remove(Image.fromarray(rgb), session=_session, post_process_mask=True))
    a = rgba[:, :, 3]
    m = (a > 128).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:  # только самый большой кусок — машина
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        a = np.where(lab == k, a, 0).astype(np.uint8)
    return rgba[:, :, :3], a


def cartoon(rgb, alpha):
    img = rgb.copy()
    for _ in range(2):
        img = cv2.bilateralFilter(img, 9, 50, 50)
    # меньше цветов — фото превращается в игровую «покраску»
    inside = alpha > 0
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    pts = lab[inside.reshape(-1)]
    k = 18
    if len(pts) > k * 10:
        sample = pts[np.random.default_rng(1).choice(len(pts), min(len(pts), 60000), replace=False)]
        _, _, centers = cv2.kmeans(sample, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5), 3, cv2.KMEANS_PP_CENTERS)
        d = ((lab[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        q = centers[d.argmin(1)].reshape(img.shape).astype(np.uint8)
        img = cv2.cvtColor(q, cv2.COLOR_LAB2RGB)
    # контуры
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.medianBlur(g, 5)
    e = cv2.Canny(g, 50, 130)
    e = cv2.dilate(e, np.ones((2, 2), np.uint8))
    e = cv2.GaussianBlur(e, (3, 3), 0).astype(np.float32) / 255 * 0.55
    img = (img.astype(np.float32) * (1 - e[:, :, None]) + 18 * e[:, :, None])
    # сочнее
    hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.25, 0, 255)
    hsv[:, :, 2] = np.clip((hsv[:, :, 2] - 128) * 1.12 + 132, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)


def hide_hubs(img, alpha, orig):
    """Колёса — тёмные круги у низа машины; центр (где значок) закрашиваем ровным металлом."""
    h, w = alpha.shape
    g = cv2.medianBlur(cv2.cvtColor(orig, cv2.COLOR_RGB2GRAY), 5)
    cs = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1.2, minDist=w * 0.3, param1=110, param2=24,
                          minRadius=int(h * 0.14), maxRadius=int(h * 0.34))
    found = []
    if cs is not None:
        for x, y, r in cs[0][:12]:
            x, y, r = int(x), int(y), int(r)
            if not (h * 0.55 < y < h * 0.92 and y + r > h * 0.82 and r * 0.6 < x < w - r * 0.6):
                continue
            ring = cv2.circle(np.zeros((h, w), np.uint8), (x, y), int(r * 0.95), 255, -1)
            cv2.circle(ring, (x, y), int(r * 0.72), 0, -1)
            tire = cv2.mean(g, mask=ring)[0]
            if tire > 90 or any(abs(x - fx) < w * 0.25 for fx, _, _ in found):  # покрышка тёмная
                continue
            found.append((x, y, r))
            if len(found) == 2:
                break
    for x, y, r in found:
        rr = max(4, int(r * 0.30))
        disk = cv2.circle(np.zeros((h, w), np.uint8), (x, y), int(r * 0.6), 255, -1)
        mean = cv2.mean(img, mask=disk)[:3]
        base = tuple(int(c * 0.85 + 30) for c in mean)
        cv2.circle(img, (x, y), rr, base, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), rr, (30, 32, 36), 2, cv2.LINE_AA)
        cv2.circle(img, (x - rr // 3, y - rr // 3), max(2, rr // 3), tuple(min(255, c + 45) for c in base), -1, cv2.LINE_AA)
    return found


def hide_spots(img, spots):
    """Ручные метки значков (доли ширины/высоты машины): затираем окружающим цветом."""
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    for x, y, r in spots:
        cv2.circle(m, (int(x * w), int(y * h)), max(3, int(r * w)), 255, -1)
    if m.any():
        img[:] = cv2.inpaint(img, m, 7, cv2.INPAINT_TELEA)


def hide_boxes(img, boxes):
    """Значки и номера на готовой картинке: прямоугольники [x, y, w, h] в долях кадра 960×540.
    Номер закрашивается ровной «табличкой», значок — затирается окружающим цветом."""
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    for b in boxes:
        x, y, bw, bh = int(b[0] * w), int(b[1] * h), max(3, int(b[2] * w)), max(3, int(b[3] * h))
        if len(b) > 4 and b[4] == 'plate':
            cv2.rectangle(img, (x, y), (x + bw, y + bh), (226, 228, 232), -1, cv2.LINE_AA)
            cv2.rectangle(img, (x, y), (x + bw, y + bh), (40, 42, 48), 2, cv2.LINE_AA)
            cv2.rectangle(img, (x + 3, y + 3), (x + max(4, bw // 9), y + bh - 3), (40, 80, 200), -1)
        else:
            cv2.ellipse(m, (x + bw // 2, y + bh // 2), (bw // 2, bh // 2), 0, 0, 360, 255, -1)
    if m.any():
        img[:] = cv2.inpaint(img, m, 9, cv2.INPAINT_TELEA)


def backdrop(rarity):
    c = np.array(GLOW.get(rarity, GLOW['common']), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    top = np.array([14, 17, 24], np.float32); bot = np.array([7, 8, 12], np.float32)
    t = (yy / H)[:, :, None]
    bg = top * (1 - t) + bot * t
    # пятно света по редкости за машиной
    d = np.sqrt(((xx - W / 2) / (W * 0.48)) ** 2 + ((yy - H * 0.48) / (H * 0.55)) ** 2)
    glow = np.clip(1 - d, 0, 1) ** 1.6
    bg = bg + c[None, None, :] * glow[:, :, None] * 0.42
    # пол
    floor = yy > H * 0.78
    bg[floor] = bg[floor] * 0.75 + np.array([10, 11, 15]) * 0.25
    bg[np.abs(yy - H * 0.78) < 1.2] += c * 0.35
    return np.clip(bg, 0, 255).astype(np.uint8)


def compose(car, alpha, rarity):
    ys, xs = np.where(alpha > 10)
    car, alpha = car[ys.min():ys.max() + 1, xs.min():xs.max() + 1], alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = alpha.shape
    s = min(W * 0.86 / w, H * 0.62 / h)
    nw, nh = int(w * s), int(h * s)
    car = cv2.resize(car, (nw, nh), interpolation=cv2.INTER_AREA)
    alpha = cv2.resize(alpha, (nw, nh), interpolation=cv2.INTER_AREA)
    bg = backdrop(rarity).astype(np.float32)
    x0, y1 = (W - nw) // 2, int(H * 0.80)
    y0 = y1 - nh
    # тень
    sh = np.zeros((H, W), np.float32)
    cv2.ellipse(sh, (W // 2, y1 - 2), (int(nw * 0.47), max(8, int(nh * 0.07))), 0, 0, 360, 1.0, -1)
    sh = cv2.GaussianBlur(sh, (0, 0), 9)
    bg *= (1 - sh[:, :, None] * 0.75)
    # отражение на полу
    ref = cv2.flip(car, 0).astype(np.float32); ra = cv2.flip(alpha, 0).astype(np.float32) / 255
    fade = np.linspace(0.22, 0, nh)[:, None]
    ry0, ry1 = y1, min(H, y1 + nh)
    rh = ry1 - ry0
    if rh > 0:
        a = (ra[:rh] * fade[:rh])[:, :, None]
        bg[ry0:ry1, x0:x0 + nw] = bg[ry0:ry1, x0:x0 + nw] * (1 - a) + ref[:rh] * a
    # обводка-свечение по редкости
    c = np.array(GLOW.get(rarity, GLOW['common']), np.float32)
    rim = np.zeros((H, W), np.float32)
    rim[y0:y1, x0:x0 + nw] = alpha.astype(np.float32) / 255
    rim = cv2.GaussianBlur(rim, (0, 0), 10)
    bg = bg + c[None, None, :] * rim[:, :, None] * 0.35
    a = (alpha.astype(np.float32) / 255)[:, :, None]
    bg[y0:y1, x0:x0 + nw] = bg[y0:y1, x0:x0 + nw] * (1 - a) + car.astype(np.float32) * a
    # виньетка
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - 0.35 * np.clip(np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) - 0.55, 0, 1)
    return np.clip(bg * v[:, :, None], 0, 255).astype(np.uint8)


def run(src, rarity, out, flip=False, spots=(), boxes=()):
    rgb = np.array(Image.open(src).convert('RGB'))
    if max(rgb.shape[:2]) > 1400:
        k = 1400 / max(rgb.shape[:2])
        rgb = cv2.resize(rgb, (int(rgb.shape[1] * k), int(rgb.shape[0] * k)), interpolation=cv2.INTER_AREA)
    car, a = cutout(rgb)
    if flip:  # все машины смотрят вправо
        car, a = cv2.flip(car, 1), cv2.flip(a, 1)
    ys, xs = np.where(a > 10)
    car, a = car[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(), a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
    hide_spots(car, spots)
    st = cartoon(car, a)
    hubs = []  # автопоиск колёс ошибался — значки и номера закрываются ручными метками (boxes)
    img = compose(st, a, rarity)
    hide_boxes(img, boxes)
    Image.fromarray(img).save(out, quality=86)
    return len(hubs)


if __name__ == '__main__':
    import json
    spots = json.loads(sys.argv[5]) if len(sys.argv) > 5 else []
    boxes = json.loads(sys.argv[6]) if len(sys.argv) > 6 else []
    print('ok', run(sys.argv[1], sys.argv[2], sys.argv[3], len(sys.argv) > 4 and sys.argv[4] == 'flip', spots, boxes))
