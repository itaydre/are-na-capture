#!/bin/bash
# Simple script to create placeholder icons using sips (macOS) or ImageMagick

for size in 16 48 128; do
  # Try using sips (macOS built-in)
  if command -v sips &> /dev/null; then
    # Create a simple colored square
    echo "Creating icon${size}.png using sips..."
    # Create a temporary image with sips
    sips -s format png --setProperty formatOptions 100 -z ${size} ${size} /System/Library/CoreServices/DefaultDesktop.heic icon${size}.png 2>/dev/null || \
    # Fallback: create using Python with basic colors
    python3 << PYTHON
from PIL import Image
img = Image.new('RGB', (${size}, ${size}), (74, 144, 226))
img.save('icon${size}.png')
PYTHON
  elif command -v convert &> /dev/null; then
    # Use ImageMagick
    convert -size ${size}x${size} xc:"#4A90E2" icon${size}.png
  else
    echo "Warning: Could not create icon${size}.png automatically."
    echo "Please create a ${size}x${size} PNG image manually and save it as icon${size}.png"
  fi
done
