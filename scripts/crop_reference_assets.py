import os
from PIL import Image

p33_path = r'docs/implementation-tickets/references/ui/final-design-p33.png'
out_dir = r'frontend/public/images'
os.makedirs(out_dir, exist_ok=True)

img = Image.open(p33_path)
w, h = img.size
print(f"p33 size: {w} x {h}")

# The image p33 has two mockups: Figure 32 (top) and Figure 33 (bottom)
# Let's crop:
# 1. Figure 33 Hero Food Photo (Grilled Chicken Rice skillet):
# In Figure 33 (bottom mockup), the photo sits near the top of Figure 33.
# Figure 33 starts around y = 0.5 * h to 0.9 * h, x = 0.35 * w to 0.65 * w.

# Let's inspect coordinates precisely:
# We will crop the hero food photo from Figure 33:
# Relative coordinates based on 827 x 1169 (or whatever w, h is)
hero_box = (int(w * 0.395), int(h * 0.505), int(w * 0.627), int(h * 0.583))
hero_img = img.crop(hero_box)
hero_img.save(os.path.join(out_dir, 'grilled-chicken-rice-hero.png'))
print(f"Saved hero photo: {hero_img.size}")

# 2. Thumbnail 1: Grilled Chicken Rice (from Figure 32)
thumb1_box = (int(w * 0.407), int(h * 0.177), int(w * 0.459), int(h * 0.214))
thumb1 = img.crop(thumb1_box)
thumb1.save(os.path.join(out_dir, 'grilled-chicken-rice-thumb.png'))

# 3. Thumbnail 2: Vegetable Kottu (from Figure 32)
thumb2_box = (int(w * 0.407), int(h * 0.252), int(w * 0.459), int(h * 0.289))
thumb2 = img.crop(thumb2_box)
thumb2.save(os.path.join(out_dir, 'vegetable-kottu-thumb.png'))

# 4. Thumbnail 3: Prawn Noodles (from Figure 32)
thumb3_box = (int(w * 0.407), int(h * 0.328), int(w * 0.459), int(h * 0.365))
thumb3 = img.crop(thumb3_box)
thumb3.save(os.path.join(out_dir, 'prawn-noodles-thumb.png'))

print("All reference culinary assets cropped successfully!")
