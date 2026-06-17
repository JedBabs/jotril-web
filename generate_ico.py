import os
import math
from PIL import Image, ImageDraw

def draw_j(draw, offset_x, offset_y, fill_color, scale=1.0):
    # Scale coordinates from 100x100 to target size (64x64 or 32x32)
    s = lambda val: val * scale
    
    ox = offset_x
    oy = offset_y
    
    # Outer ellipse bounding box
    outer_box = [s(22) + ox, s(36) + oy, s(78) + ox, s(88) + oy]
    # Inner ellipse bounding box
    inner_box = [s(40) + ox, s(53) + oy, s(56) + ox, s(71) + oy]
    # Stem bounding box
    stem_box = [s(56) + ox, s(15) + oy, s(78) + ox, s(62) + oy]
    # Hook bounding box
    hook_box = [s(22) + ox, s(50) + oy, s(40) + ox, s(62) + oy]

    # Draw outer curve (a pie/arc slice)
    # The arc goes from 0 degrees (east) to 180 degrees (west) down to south.
    # In PIL, 0 starts at 3 o'clock, clockwise. So south is 90, west is 180.
    # We want to draw from 0 (east) to 180 (west) via south (90).
    draw.pieslice(outer_box, start=0, end=180, fill=fill_color)
    
    # Draw stem
    draw.rectangle(stem_box, fill=fill_color)
    
    # Draw hook vertical top
    draw.rectangle(hook_box, fill=fill_color)

def generate_icon(size):
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    scale = size / 100.0
    
    # Draw Background Squircle
    # We want a subtle margin (4px on a 100px canvas)
    bg_margin = 4 * scale
    draw.rounded_rectangle(
        [bg_margin, bg_margin, size - bg_margin, size - bg_margin],
        radius=22 * scale,
        fill=(14, 0, 31, 255) # Deep violet-black #0E001F
    )
    
    # Draw border (subtle gradient/color outline)
    # Instead of true gradient, we can draw a rounded rectangle outline in neon purple
    draw.rounded_rectangle(
        [bg_margin, bg_margin, size - bg_margin, size - bg_margin],
        radius=22 * scale,
        outline=(181, 110, 255, 255), # Neon purple #B56EFF
        width=int(max(1, 2 * scale))
    )
    
    # Color definitions
    cyan_color = (6, 182, 212, 180) # Cyan #06B6D4 with opacity
    pink_color = (255, 93, 208, 180) # Pink #FF5DD0 with opacity
    white_color = (255, 255, 255, 255) # White
    
    # Scale inner cut out color to background color
    bg_color = (14, 0, 31, 255)
    
    # Draw Cyan layer (shifted left-down)
    draw_j(draw, -2 * scale, 1 * scale, cyan_color, scale)
    
    # Draw Pink layer (shifted right-up)
    draw_j(draw, 2 * scale, -1 * scale, pink_color, scale)
    
    # Draw White layer (centered)
    draw_j(draw, 0, 0, white_color, scale)
    
    # Cut out the inner part using background color (inner ellipse)
    inner_box = [40 * scale, 53 * scale, 56 * scale, 71 * scale]
    # We draw an ellipse filled with background color
    draw.ellipse(inner_box, fill=bg_color)
    
    return img

# Generate multi-resolution sizes for ICO format
img_16 = generate_icon(16)
img_32 = generate_icon(32)
img_48 = generate_icon(48)
img_64 = generate_icon(64)

# Save as ICO
output_path = r"c:\Users\User\Projects\Jotril-web\jotril-web\src\app\favicon.ico"
img_32.save(output_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)], append_images=[img_16, img_48, img_64])
print("Successfully generated favicon.ico")
