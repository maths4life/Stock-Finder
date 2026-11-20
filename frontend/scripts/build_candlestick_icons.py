import os
import base64
from PIL import Image, ImageDraw

def create_adaptive_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="100%" height="100%">
  <style>
    path, rect { fill: #0F172A; }
    @media (prefers-color-scheme: dark) {
      path, rect { fill: #F8FAFC; }
    }
  </style>
  <!-- Left Axis -->
  <rect x="0" y="0" width="89" height="800" />
  <!-- Bottom Axis -->
  <rect x="0" y="711" width="800" height="89" />

  <!-- Left Candle (Solid) -->
  <rect x="278" y="119" width="50" height="121" />
  <rect x="180" y="240" width="246" height="329" />
  <rect x="278" y="569" width="50" height="58" />

  <!-- Right Candle (Hollow) -->
  <rect x="591" y="52" width="50" height="90" />
  <path fill-rule="evenodd" d="M 475 142 H 758 V 450 H 475 Z M 537 204 H 695 V 388 H 537 Z" />
  <rect x="591" y="450" width="50" height="77" />
</svg>'''

def render_raster_icon(size=800, dark_theme=True):
    # Render with dark theme padding or crisp container for high visibility on any tab
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    scale = size / 800.0
    
    # Rounded dark squircle container to guarantee visibility on light and dark browser tabs
    # Container background: #0B0F17
    # Border: #38BDF8 / 25% or #1E293B
    margin = int(24 * scale)
    rx = int(140 * scale)
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=rx,
        fill=(11, 15, 23, 255),
        outline=(56, 189, 248, 70),
        width=max(1, int(12 * scale))
    )
    
    # Scale and center the candlestick graphic inside the squircle
    # Inner padding
    inner_scale = (size - 2 * margin - int(60 * scale)) / 800.0
    offset_x = (size - 800 * inner_scale) / 2.0
    offset_y = (size - 800 * inner_scale) / 2.0
    
    def transform_rect(x, y, w, h):
        return [
            int(offset_x + x * inner_scale),
            int(offset_y + y * inner_scale),
            int(offset_x + (x + w) * inner_scale),
            int(offset_y + (y + h) * inner_scale)
        ]
        
    candle_color = (248, 250, 252, 255) # Crisp White
    accent_color = (56, 189, 248, 255)  # Electric Cyan
    
    # Axes in accent color
    d.rectangle(transform_rect(0, 0, 89, 800), fill=accent_color)
    d.rectangle(transform_rect(0, 711, 800, 89), fill=accent_color)
    
    # Left Candle (Solid White / Emerald)
    d.rectangle(transform_rect(278, 119, 50, 121), fill=candle_color)
    d.rectangle(transform_rect(180, 240, 246, 329), fill=candle_color)
    d.rectangle(transform_rect(278, 569, 50, 58), fill=candle_color)
    
    # Right Candle (Hollow White / Cyan)
    d.rectangle(transform_rect(591, 52, 50, 90), fill=candle_color)
    d.rectangle(transform_rect(475, 142, 283, 308), fill=candle_color)
    d.rectangle(transform_rect(537, 204, 158, 184), fill=(11, 15, 23, 255)) # cutout
    d.rectangle(transform_rect(591, 450, 50, 77), fill=candle_color)
    
    return img

def render_raw_vector_icon(size=800, color=(248, 250, 252, 255)):
    # Pure vector on transparent background for exact 1:1 match
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    scale = size / 800.0
    
    def r(x, y, w, h):
        return [int(x * scale), int(y * scale), int((x + w) * scale), int((y + h) * scale)]
        
    d.rectangle(r(0, 0, 89, 800), fill=color)
    d.rectangle(r(0, 711, 800, 89), fill=color)
    d.rectangle(r(278, 119, 50, 121), fill=color)
    d.rectangle(r(180, 240, 246, 329), fill=color)
    d.rectangle(r(278, 569, 50, 58), fill=color)
    d.rectangle(r(591, 52, 50, 90), fill=color)
    d.rectangle(r(475, 142, 283, 308), fill=color)
    d.rectangle(r(537, 204, 158, 184), fill=(0, 0, 0, 0))
    d.rectangle(r(591, 450, 50, 77), fill=color)
    return img

def main():
    public_dir = r"d:\Users\Malhar\Projects\Stock Finder\frontend\public"
    output_public_dir = r"d:\Users\Malhar\Projects\Stock Finder\frontend\.output\public"
    
    # 1. Save dynamic adaptive SVG
    svg_path = os.path.join(public_dir, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(create_adaptive_svg())
    print("Generated dynamic adaptive favicon.svg")
    
    # 2. Render master badge icon (800x800)
    master = render_raster_icon(800)
    master.save(os.path.join(public_dir, "logo.png"), "PNG")
    master.save(os.path.join(public_dir, "icon-512.png"), "PNG")
    
    # 3. Save standard icon sizes
    master.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "icon-192.png"), "PNG")
    master.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "apple-touch-icon.png"), "PNG")
    master.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon-32x32.png"), "PNG")
    master.resize((16, 16), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon-16x16.png"), "PNG")
    
    # 4. Save multi-resolution favicon.ico
    master.save(
        os.path.join(public_dir, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print("Generated favicon.ico (16, 32, 48, 64, 128, 256)")
    
    # 5. Copy all to frontend/.output/public
    import shutil
    for fname in ["favicon.ico", "favicon.svg", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "logo.png"]:
        shutil.copy2(os.path.join(public_dir, fname), os.path.join(output_public_dir, fname))
    print("Synchronized with frontend/.output/public")

if __name__ == "__main__":
    main()
