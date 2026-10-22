#!/usr/bin/env python3
"""p3.py <hex>...: how a phone screenshot records an sRGB color.

The Pixel's screencap is in Display P3, so an exact sRGB color from the
prototype shows up as different numbers. Compare the app's pixels with
these, not with the prototype's hex.
"""
import sys

# Linear sRGB to linear Display P3.
M = [[0.8224621, 0.1775380, 0.0], [0.0331941, 0.9668058, 0.0], [0.0170827, 0.0723974, 0.9105199]]


def linear(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def encode(c):
    c = max(0.0, min(1.0, c))
    return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))


for value in sys.argv[1:]:
    h = value.lstrip('#')
    rgb = [linear(int(h[i:i + 2], 16)) for i in (0, 2, 4)]
    p3 = [encode(sum(M[row][col] * rgb[col] for col in range(3))) for row in range(3)]
    print(f'{h} -> P3 {p3[0]:02x}{p3[1]:02x}{p3[2]:02x}')
