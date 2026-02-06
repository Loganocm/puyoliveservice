
import shutil
import os

# We'll use the largest media file we found, assuming it's the high-res generation
# media__1770273823518.png is ~792KB
base_dir = r'C:\Users\Logan\.gemini\antigravity\brain\a2336af9-b5cd-4dd9-b3d6-f11767d3de04'
src = os.path.join(base_dir, 'media__1770273823518.png')
dst = r'C:\Users\Logan\Desktop\Github\Puyio\public\bg_highres.png'

print(f"Installing background from {src}")

try:
    if os.path.exists(src):
        shutil.copy(src, dst)
        print(f"SUCCESS: Copied to {dst}")
    else:
        print(f"ERROR: Source file not found: {src}")
        # Fallback to the named one if the media one is missing
        src = os.path.join(base_dir, 'puyo_background_purple_2k.png')
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"SUCCESS: Copied fallback {src} to {dst}")
        else:
            print("ERROR: No suitable background found.")
except Exception as e:
    print(f"EXCEPTION: {e}")
