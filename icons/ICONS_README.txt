ICON CREATION INSTRUCTIONS
==========================

The extension requires three icon files:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)  
- icon128.png (128x128 pixels)

You can create these icons using any of the following methods:

1. ONLINE TOOLS:
   - Use an online icon generator like https://www.favicon-generator.org/
   - Upload a square image and download the generated sizes
   - Rename the files to icon16.png, icon48.png, and icon128.png

2. IMAGE EDITORS:
   - Use Photoshop, GIMP, Preview (macOS), or any image editor
   - Create a square image with the Are.na blue color (#4A90E2)
   - Export at 16x16, 48x48, and 128x128 pixels
   - Save as icon16.png, icon48.png, and icon128.png

3. QUICK PLACEHOLDER:
   - Create a simple colored square (blue: #4A90E2)
   - Add a white "A" letter in the center if desired
   - Export at the three required sizes

4. USING COMMAND LINE (macOS with ImageMagick):
   convert -size 16x16 xc:"#4A90E2" icon16.png
   convert -size 48x48 xc:"#4A90E2" icon48.png
   convert -size 128x128 xc:"#4A90E2" icon128.png

The extension will work with simple colored squares as placeholders.
You can always replace them with better-designed icons later.
