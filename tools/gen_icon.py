#!/usr/bin/env python3
# App icon: a small blue CRT showing "NS" in the game's Unifont.
#   python3 tools/gen_icon.py   ->  build/icon.png, build/icon.ico, electron/icon.png
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# bezel
d.rounded_rectangle((24, 40, S - 24, S - 40), radius=56, fill=(214, 204, 178, 255), outline=(120, 110, 90, 255), width=6)
# screen
scr = (70, 84, S - 70, S - 104)
d.rounded_rectangle(scr, radius=36, fill=(13, 27, 140, 255))
# text
font = ImageFont.truetype('public/fonts/unifont.otf', 192)
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.text((S // 2, (scr[1] + scr[3]) // 2 - 6), 'NS', font=font, fill=(160, 200, 255, 255), anchor='mm')
glow = glow.filter(ImageFilter.GaussianBlur(10))
img.alpha_composite(glow)
d = ImageDraw.Draw(img)
d.text((S // 2, (scr[1] + scr[3]) // 2 - 6), 'NS', font=font, fill=(232, 236, 255, 255), anchor='mm')
# star
star = ImageFont.truetype('public/fonts/unifont.otf', 64)
d.text((scr[2] - 44, scr[1] + 36), '★', font=star, fill=(255, 210, 74, 255), anchor='mm')
# scanlines (blended overlay)
lines = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ld = ImageDraw.Draw(lines)
for y in range(scr[1] + 4, scr[3] - 4, 6):
    ld.line((scr[0] + 10, y, scr[2] - 10, y), fill=(0, 0, 30, 60), width=2)
img.alpha_composite(lines)
d = ImageDraw.Draw(img)
# power led
d.ellipse((S - 120, S - 84, S - 104, S - 68), fill=(80, 255, 120, 255))

img.save('build/icon.png')
img.save('electron/icon.png')
img.save('build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')
