import os
import base64
from PIL import Image

src_path = r"C:\Users\Malhar\.gemini\antigravity\brain\1f2cee69-3ede-4f2e-a872-3d6bde21d41a\.user_uploaded\media_1795169984570_fad5f24e.png"
public_dir = r"d:\Users\Malhar\Projects\Stock Finder\frontend\public"
output_public_dir = r"d:\Users\Malhar\Projects\Stock Finder\frontend\.output\public"

os.makedirs(public_dir, exist_ok=True)
os.makedirs(output_public_dir, exist_ok=True)

# Open high-res 512x512 RGBA source
img = Image.open(src_path).convert("RGBA")

# 1. Save logo.png and icon-512.png
img.save(os.path.join(public_dir, "logo.png"), "PNG")
img.save(os.path.join(public_dir, "icon-512.png"), "PNG")

# 2. Save icon-192.png
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(public_dir, "icon-192.png"), "PNG")

# 3. Save apple-touch-icon.png (180x180)
img_180 = img.resize((180, 180), Image.Resampling.LANCZOS)
img_180.save(os.path.join(public_dir, "apple-touch-icon.png"), "PNG")

# 4. Save favicon-32x32.png and favicon-16x16.png
img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
img_32.save(os.path.join(public_dir, "favicon-32x32.png"), "PNG")

img_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
img_16.save(os.path.join(public_dir, "favicon-16x16.png"), "PNG")

# 5. Save multi-resolution favicon.ico
img_48 = img.resize((48, 48), Image.Resampling.LANCZOS)
img_64 = img.resize((64, 64), Image.Resampling.LANCZOS)
img_128 = img.resize((128, 128), Image.Resampling.LANCZOS)
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)

ico_path = os.path.join(public_dir, "favicon.ico")
img.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print("Saved favicon.ico with sizes: 16, 32, 48, 64, 128, 256")

# 6. Save favicon.svg with embedded base64 high-res PNG
with open(os.path.join(public_dir, "icon-512.png"), "rb") as f:
    b64_png = base64.b64encode(f.read()).decode("ascii")

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_png}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>'''

svg_path = os.path.join(public_dir, "favicon.svg")
with open(svg_path, "w", encoding="utf-8") as f:
    f.write(svg_content)
print("Saved favicon.svg with embedded high-res image")

# 7. Copy all to frontend/.output/public
import shutil
for fname in ["favicon.ico", "favicon.svg", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "logo.png"]:
    src_file = os.path.join(public_dir, fname)
    dst_file = os.path.join(output_public_dir, fname)
    shutil.copy2(src_file, dst_file)
print("Copied all assets to frontend/.output/public")
