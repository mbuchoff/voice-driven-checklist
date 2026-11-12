#!/bin/sh
# side.sh <prototype.png> <phone.png> <out.png>: the prototype (captured at
# 1 CSS px per dp) beside the phone screenshot scaled to the same dp width.
# Needs ImageMagick's convert.
width=$(identify -format '%w' "$1")
convert "$1" \( "$2" -resize "${width}x" \) -background white -splice 10x0 +append "$3"
