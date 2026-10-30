from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re

root=Path('.').resolve();out=root/'output/submission/udyam-source.zip';out.parent.mkdir(parents=True,exist_ok=True)
paths=[p for p in root.glob('*.md') if p.is_file()]
paths += [root/name for name in ['.gitignore','.env.example','package.json','package-lock.json','server.mjs','index.html','style.css','app.js','locale.js']]
for folder in ['src','tests','scripts','YTL_TrackA_Udyam_Digital_Data']:
 paths += [p for p in (root/folder).rglob('*') if p.is_file()]
paths += [p for p in (root/'reports').glob('*') if p.is_file() and not p.name.startswith('live-ai-check')]
secret=re.compile(rb'(?:gsk_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,})')
with ZipFile(out,'w',ZIP_DEFLATED) as archive:
 for p in sorted(set(paths)):
  relative=p.relative_to(root)
  if p.name=='.env' or 'node_modules' in relative.parts or 'var' in relative.parts:raise RuntimeError('Private file in source allowlist')
  content=p.read_bytes()
  if p.suffix.lower() in ['.js','.mjs','.json','.md','.txt','.ps1','.py'] and secret.search(content):raise RuntimeError('Possible credential found in a source file; archive not ready')
  archive.writestr(relative.as_posix(),content)
with ZipFile(out) as archive:
 names=archive.namelist()
 assert '.env' not in names and '.env.example' in names
 assert not any(n.startswith(('var/','node_modules/','tmp/')) for n in names)
 assert 'src/ai-config.mjs' in names and 'YTL_TrackA_Udyam_Digital_Data/product_catalogue.csv' in names
print(f'Source package ready: {len(names)} files, {out.stat().st_size} bytes. Private environment and local orders excluded.')
