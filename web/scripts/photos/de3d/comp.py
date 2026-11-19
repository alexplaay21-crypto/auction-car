"""Рендер с прозрачным фоном → игровая карточка (студийная подложка по редкости, тень, отражение).
usage: comp.py <in.png> <rarity> <out.jpg> [boxes_json]"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'de2'))
import numpy as np
from PIL import Image
import cv2
from stylize import compose, hide_boxes
rgba = np.array(Image.open(sys.argv[1]).convert('RGBA'))
a = rgba[:, :, 3]
ys, xs = np.where(a > 8)
car = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1, :3].copy()
al = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
img = compose(car, al, sys.argv[2])
if len(sys.argv) > 4: hide_boxes(img, json.loads(sys.argv[4]))
Image.fromarray(img).save(sys.argv[3], quality=88)
