"""Листы выбора: по 5 машин, у каждой до 6 кандидатов с номерами. usage: sheet.py <from> <to> <out.jpg>"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/home/user/auction-car')
d = json.load(open('cands2.json'))
names = json.load(open('names.json'))
a, b, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
TW, TH = 220, 140
rows = [str(i) for i in range(a, b) if str(i) in d]
img = Image.new('RGB', (6 * TW + 10, len(rows) * (TH + 24) + 4), (20, 20, 24))
dr = ImageDraw.Draw(img)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: font = ImageFont.load_default()
for r, k in enumerate(rows):
    y = r * (TH + 24)
    dr.text((6, y + 3), f'#{k} {names[int(k)]}', fill=(255, 200, 80), font=font)
    for j in range(6):
        p = f'th/{k}-{j}.jpg'
        if not os.path.exists(p): continue
        t = Image.open(p).convert('RGB'); t.thumbnail((TW - 6, TH - 4))
        x = j * TW + 4
        img.paste(t, (x, y + 22))
        dr.rectangle([x, y + 22, x + 22, y + 42], fill=(0, 0, 0)); dr.text((x + 6, y + 23), str(j), fill=(255, 255, 255), font=font)
img.save(out, quality=80)
