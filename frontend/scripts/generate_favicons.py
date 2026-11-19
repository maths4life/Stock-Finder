import os
from PIL import Image, ImageDraw

def create_svg():
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="sf-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0F17" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="sf-trend" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981" />
      <stop offset="45%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
    <linearGradient id="sf-area" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#10B981" stop-opacity="0.0" />
    </linearGradient>
  </defs>
  <!-- Obsidian dark container with rounded squircle -->
  <rect x="1" y="1" width="62" height="62" rx="14" fill="url(#sf-bg)" stroke="#38BDF8" stroke-width="1.5" stroke-opacity="0.32" />
  
  <!-- Subtle gradient area fill under investment trendline -->
  <path d="M 13 45 L 24 33 L 34 40 L 49 20 L 49 48 L 13 48 Z" fill="url(#sf-area)" />
  
  <!-- Investment trendline -->
  <path d="M 13 45 L 24 33 L 34 40 L 49 20" fill="none" stroke="url(#sf-trend)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
  
  <!-- Arrow Head -->
  <path d="M 39 20 H 49 V 30" fill="none" stroke="#38BDF8" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Accent glow node at peak -->
  <circle cx="49" cy="20" r="2.2" fill="#38BDF8" />
</svg>'''
    return svg_content

def interpolate_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))

def render_high_res_image(size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scale = size / 64.0
    
    # Create mask for squircle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    margin = int(1 * scale)
    rx = int(14 * scale)
    mask_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=rx,
        fill=255
    )
    
    # Create background gradient
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c_start = (11, 15, 23, 255)   # #0B0F17
    c_end = (17, 24, 39, 255)     # #111827
    for y in range(size):
        t = y / float(size)
        c = interpolate_color(c_start, c_end, t)
        for x in range(size):
            # diagonal blend
            diag_t = (x + y) / (2.0 * size)
            color = interpolate_color(c_start, c_end, diag_t)
            bg.putpixel((x, y), color)
    
    # Composite bg with squircle mask
    img.paste(bg, (0, 0), mask)
    
    draw = ImageDraw.Draw(img)
    
    # Squircle border stroke
    border_color = (56, 189, 248, 85) # #38BDF8 at 33%
    border_w = max(1, int(1.5 * scale))
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=rx,
        outline=border_color,
        width=border_w
    )
    
    # Area fill under trend
    area_poly = [
        (int(13 * scale), int(45 * scale)),
        (int(24 * scale), int(33 * scale)),
        (int(34 * scale), int(40 * scale)),
        (int(49 * scale), int(20 * scale)),
        (int(49 * scale), int(48 * scale)),
        (int(13 * scale), int(48 * scale)),
    ]
    # Draw area on transparent layer with gradient opacity
    area_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    area_draw = ImageDraw.Draw(area_layer)
    area_draw.polygon(area_poly, fill=(56, 189, 248, 45))
    img.alpha_composite(area_layer)
    
    # Line points
    # (13, 45) -> (24, 33) -> (34, 40) -> (49, 20)
    pts = [
        (13 * scale, 45 * scale),
        (24 * scale, 33 * scale),
        (34 * scale, 40 * scale),
        (49 * scale, 20 * scale)
    ]
    line_w = int(4.5 * scale)
    
    # Draw trendline segments with gradient
    c_emerald = (16, 185, 129, 255)
    c_cyan = (56, 189, 248, 255)
    
    # Multi-step smooth line
    segs = [(pts[0], pts[1]), (pts[1], pts[2]), (pts[2], pts[3])]
    num_segs = len(segs)
    for i, (p1, p2) in enumerate(segs):
        t1 = i / float(num_segs)
        t2 = (i + 1) / float(num_segs)
        col = interpolate_color(c_emerald, c_cyan, (t1 + t2) / 2.0)
        draw.line([p1, p2], fill=col, width=line_w)
    
    # Joints
    for i, p in enumerate(pts):
        t = i / float(len(pts) - 1)
        col = interpolate_color(c_emerald, c_cyan, t)
        draw.ellipse([p[0] - line_w/2, p[1] - line_w/2, p[0] + line_w/2, p[1] + line_w/2], fill=col)
        
    # Arrow head: (39, 20) -> (49, 20) -> (49, 30)
    p_h = (39 * scale, 20 * scale)
    p_corner = (49 * scale, 20 * scale)
    p_v = (49 * scale, 30 * scale)
    draw.line([p_h, p_corner], fill=c_cyan, width=line_w)
    draw.line([p_corner, p_v], fill=c_cyan, width=line_w)
    draw.ellipse([p_h[0] - line_w/2, p_h[1] - line_w/2, p_h[0] + line_w/2, p_h[1] + line_w/2], fill=c_cyan)
    draw.ellipse([p_v[0] - line_w/2, p_v[1] - line_w/2, p_v[0] + line_w/2, p_v[1] + line_w/2], fill=c_cyan)
    
    # Accent node
    r_node = 2.2 * scale
    draw.ellipse([pts[3][0] - r_node, pts[3][1] - r_node, pts[3][0] + r_node, pts[3][1] + r_node], fill=(255, 255, 255, 255))
    
    return img

def main():
    out_dir = "frontend/public"
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Write SVG
    svg_path = os.path.join(out_dir, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(create_svg())
    print(f"Generated {svg_path}")
    
    # 2. Render master 1024x1024
    master = render_high_res_image(1024)
    
    # 3. Save Apple Touch Icon (180x180)
    apple_path = os.path.join(out_dir, "apple-touch-icon.png")
    apple_img = master.resize((180, 180), Image.Resampling.LANCZOS)
    apple_img.save(apple_path, "PNG")
    print(f"Generated {apple_path}")
    
    # 4. Save PNG icons (32x32, 192x192, 512x512)
    png_32 = master.resize((32, 32), Image.Resampling.LANCZOS)
    png_32.save(os.path.join(out_dir, "favicon-32x32.png"), "PNG")
    
    png_192 = master.resize((192, 192), Image.Resampling.LANCZOS)
    png_192.save(os.path.join(out_dir, "icon-192.png"), "PNG")
    
    png_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    png_512.save(os.path.join(out_dir, "icon-512.png"), "PNG")
    
    # 5. Save multi-resolution ICO (16, 32, 48, 64)
    ico_path = os.path.join(out_dir, "favicon.ico")
    master.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )
    print(f"Generated {ico_path} with sizes 16, 32, 48, 64")

if __name__ == "__main__":
    main()
