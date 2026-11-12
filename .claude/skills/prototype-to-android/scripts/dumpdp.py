#!/usr/bin/env python3
"""dumpdp.py [ymin_dp] [ymax_dp]: the app's elements with bounds in dp, for
comparing with the prototype's getBoundingClientRect. Guarded like phone.py.

Set PHONE_DENSITY to the phone's density (default 2.625, a Pixel 7).
"""
import importlib.util
import os
import re
import sys

spec = importlib.util.spec_from_file_location('phone', os.path.join(os.path.dirname(__file__), 'phone.py'))
phone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phone)

lo = float(sys.argv[1]) if len(sys.argv) > 1 else 0
hi = float(sys.argv[2]) if len(sys.argv) > 2 else 9999
density = float(os.environ.get('PHONE_DENSITY', '2.625'))
phone.guard()
for node in phone.dump().iter('node'):
    rid = node.get('resource-id', '').split('/')[-1]
    text = node.get('text', '')
    desc = node.get('content-desc', '')
    if not (rid or text or desc):
        continue
    x1, y1, x2, y2 = (int(v) / density for v in re.findall(r'\d+', node.get('bounds')))
    if lo <= y1 <= hi:
        print(f'{rid[:24]:24} {text[:22]!r:24} {desc[:26]!r:28} x={x1:6.1f} y={y1:6.1f} w={x2 - x1:6.1f} h={y2 - y1:6.1f}')
