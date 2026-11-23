"""Builds a no-sign-in demo that runs as a Claude artifact (or any static host, at any path).
- Exports the web app in demo mode with photos bundled locally (artifacts can't load outside images).
- Rewrites asset paths so the app works from whatever folder it's served from.
Usage: python3 scripts/build-claude-demo.py <free-exercise-db folder> <output folder> <short image folder>
Writes <output>/files.json listing what to upload (paths into <output> and <short image folder>)."""
import glob, json, os, re, shutil, subprocess, sys
from PIL import Image

fedb, out, imgdir = sys.argv[1:4]
env = dict(os.environ, EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', EXPO_PUBLIC_DEMO='1', EXPO_PUBLIC_LOCAL_IMAGES='1', CI='1')
shutil.rmtree(out, ignore_errors=True); shutil.rmtree(imgdir, ignore_errors=True)
subprocess.run(['npx', 'expo', 'export', '--platform', 'web', '--output-dir', out], env=env, check=True)
for f in ('metadata.json', 'favicon.ico'):
    if os.path.exists(f'{out}/{f}'): os.remove(f'{out}/{f}')
js = f'{out}/_expo/static/js/web'
# file names with brackets (route [id]) -> plain names
# Claude artifacts reserve names starting with "_": rename those files and the _expo folder
renames = {f: re.sub(r'^_+', 'u', f.replace('[', '').replace(']', '')) for f in os.listdir(js) if '[' in f or f.startswith('_')}
for a, b in renames.items(): os.rename(f'{js}/{a}', f'{js}/{b}')
for f in glob.glob(f'{js}/*.js'):
    s = open(f).read()
    for a, b in renames.items(): s = s.replace(a, b)
    s = s.replace(':"/_expo/static/js/web/', ':window.__B+"x/static/js/web/')
    s = s.replace('"/assets/node_modules', 'window.__B+"assets/node_modules')
    open(f, 'w').write(s)
shutil.move(f'{out}/_expo', f'{out}/x')
h = open(f'{out}/index.html').read()
srcs = re.findall(r'<script src="([^"]+)" defer></script>', h)
srcs = ['/x/static/js/web/' + renames.get(os.path.basename(x), os.path.basename(x)) for x in srcs]
h = re.sub(r'<script src="[^"]+" defer></script>', '', h).replace('<link rel="icon" href="/favicon.ico"/>', '')
boot = ("<script>(function(){var b=location.pathname.replace(/[^/]*$/,'');window.__B=b;"
        "try{history.replaceState(null,'','/'+location.hash)}catch(e){}"
        f"var s={json.dumps(srcs)};s.forEach(function(p){{var e=document.createElement('script');"
        "e.src=b+p.replace(/^\\//,'');e.async=false;document.body.appendChild(e)});})();</script>")
open(f'{out}/index.html', 'w').write(h.replace('</body>', boot + '\n</body>'))
# photos: every frame, in exercises.json order, as one 300x200 cell of a 10x10 sheet (artifacts allow 512 files)
os.makedirs(imgdir)
cells = []
for e in json.load(open('src/data/exercises.json')):
    for url in e['images']:
        cells.append(os.path.join(fedb, 'exercises', url.split('/exercises/', 1)[1]))
CW, CH, COLS, ROWS = 300, 200, 10, 10
for sheet in range(0, len(cells), COLS * ROWS):
    canvas = Image.new('RGB', (CW * COLS, CH * ROWS), (31, 34, 42))
    for pos, path in enumerate(cells[sheet:sheet + COLS * ROWS]):
        im = Image.open(path).convert('RGB')
        sc = max(CW / im.width, CH / im.height)
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        l, t = (im.width - CW) // 2, (im.height - CH) // 2
        canvas.paste(im.crop((l, t, l + CW, t + CH)), ((pos % COLS) * CW, (pos // COLS) * CH))
    canvas.save(f'{imgdir}/s{sheet // (COLS * ROWS)}.jpg', 'JPEG', quality=72, optimize=True, progressive=True)
files = [{'as': os.path.relpath(p, out), 'path': p} for p in glob.glob(f'{out}/**/*', recursive=True)
         if os.path.isfile(p) and not p.endswith('files.json') and not (p.endswith('.ttf') and 'Ionicons' not in p)]
files += [{'as': 'img/' + f, 'path': f'{imgdir}/{f}'} for f in sorted(os.listdir(imgdir))]
json.dump(files, open(f'{out}/files.json', 'w'), indent=0)
print(len(files), 'files')
