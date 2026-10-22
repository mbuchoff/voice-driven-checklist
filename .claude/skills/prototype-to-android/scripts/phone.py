#!/usr/bin/env python3
"""Drive the paired phone for manual verification.

Usage:
  phone.py tap-text <text> [--contains] [--index N]
  phone.py tap-desc <content-desc> [--contains] [--index N]
  phone.py tap-id <resource-id>
  phone.py find <text-or-desc-substring>      # list matching nodes with bounds
  phone.py shot <path>
  phone.py tap <x> <y>
  phone.py text <string>                      # type text (spaces allowed)
  phone.py key <KEYCODE>
  phone.py swipe <x1> <y1> <x2> <y2> <ms>
  phone.py fg                                 # the app in front

Set PHONE_ADB to the adb to use (default: adb on PATH).
"""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ADB = os.environ.get('PHONE_ADB', 'adb')
# Only act or capture while one of these apps is in front, so a stray tap can
# never land on (or a screenshot capture) the owner's personal apps.
ALLOWED = set(filter(None, os.environ.get(
    'PHONE_ALLOW',
    'com.mbuchoff.voicechecklist,com.mbuchoff.voicechecklist.e2e,com.google.android.documentsui',
).split(',')))


def adb(*args, capture=True):
    return subprocess.run([ADB, *args], capture_output=capture, check=True).stdout


def foreground():
    out = adb('shell', 'dumpsys', 'activity', 'activities').decode()
    m = re.search(r'topResumedActivity=ActivityRecord\{\S+ \S+ ([\w.]+)/', out) or re.search(r'mResumedActivity: ActivityRecord\{\S+ \S+ ([\w.]+)/', out)
    return m.group(1) if m else ''


def focused_package():
    out = adb('shell', 'dumpsys', 'window').decode()
    m = re.search(r'mCurrentFocus=Window\{\S+ \S+ ([\w.]+)/', out)
    return m.group(1) if m else ''


def guard():
    # The window with input focus decides where a tap lands; it must belong
    # to an allowed app, and so must the resumed activity.
    bad = {focused_package(), foreground()} - ALLOWED
    if bad:
        raise SystemExit(f'REFUSED: in front {sorted(bad)!r}')


def dump():
    # Remove the previous dump first: a failed dump (e.g. "could not get idle
    # state" while an animation runs) otherwise leaves a stale file behind.
    for _ in range(5):
        adb('shell', 'rm', '-f', '/sdcard/ui.xml')
        out = subprocess.run([ADB, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'],
                             capture_output=True).stdout.decode()
        if 'dumped to' in out:
            return ET.fromstring(adb('exec-out', 'cat', '/sdcard/ui.xml'))
        time.sleep(0.6)
    raise SystemExit('uiautomator dump failed (UI never idle)')


def center(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    return (x1 + x2) // 2, (y1 + y2) // 2


def matches(root, attr, value, contains):
    out = []
    for node in root.iter('node'):
        got = node.get(attr) or ''
        if (value in got) if contains else (got == value):
            out.append(node)
    return out


def tap_by(attr, value, contains=False, index=0):
    root = dump()
    found = matches(root, attr, value, contains)
    if not found:
        raise SystemExit(f'not found: {attr}={value!r}')
    x, y = center(found[index])
    adb('shell', 'input', 'tap', str(x), str(y))
    print(f'tapped {attr}={value!r} at {x},{y}')


def main(argv):
    cmd, rest = argv[0], argv[1:]
    if cmd == 'fg':
        print(foreground())
        return
    guard()
    contains = '--contains' in rest
    index = 0
    if '--index' in rest:
        index = int(rest[rest.index('--index') + 1])
    args = [a for i, a in enumerate(rest) if not a.startswith('--') and (i == 0 or rest[i - 1] != '--index')]
    if cmd == 'tap-text':
        tap_by('text', args[0], contains, index)
    elif cmd == 'tap-desc':
        tap_by('content-desc', args[0], contains, index)
    elif cmd == 'tap-id':
        tap_by('resource-id', args[0], False, index)
    elif cmd == 'find':
        root = dump()
        for node in root.iter('node'):
            label = (node.get('text') or '') + ' | ' + (node.get('content-desc') or '') + ' | ' + (node.get('resource-id') or '')
            if args[0].lower() in label.lower():
                print(node.get('bounds'), label)
    elif cmd == 'shot':
        open(args[0], 'wb').write(adb('exec-out', 'screencap', '-p'))
        print('saved', args[0])
    elif cmd == 'tap':
        adb('shell', 'input', 'tap', args[0], args[1])
    elif cmd == 'text':
        adb('shell', 'input', 'text', args[0].replace(' ', '%s'))
    elif cmd == 'key':
        adb('shell', 'input', 'keyevent', args[0])
    elif cmd == 'swipe':
        adb('shell', 'input', 'swipe', *args[:5])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
