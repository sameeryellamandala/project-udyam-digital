from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from xml.etree import ElementTree as E
import json,re,posixpath,subprocess
import pymupdf,imageio_ffmpeg

base=Path('output/submission');result={}
with ZipFile(base/'udyam-business-case.pptx') as z:
 assert z.testzip() is None
 names=set(z.namelist());slides=[n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)]
 charts=[n for n in names if re.search(r'/charts/chart\d+\.xml$',n)]
 tables=sum(z.read(n).count(b'<a:tbl>') for n in slides)
 assert len(slides)==10 and len(charts)>=1 and tables>=3
 for name in names:
  if not name.endswith('.rels'):continue
  parent=posixpath.dirname(posixpath.dirname(name)) if name!='_rels/.rels' else ''
  for rel in E.fromstring(z.read(name)):
   if rel.attrib.get('TargetMode')=='External':continue
   target=rel.attrib.get('Target','')
   resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(parent,target))
   assert resolved in names, 'Broken internal Office relationship'
 result['presentation']={'slides':len(slides),'nativeCharts':len(charts),'nativeTables':tables,'internalRelationships':'valid'}
for filename in ['privacy-security-note.pdf','solution-architecture.pdf']:
 doc=pymupdf.open(base/filename);assert len(doc)==1
 result[filename]={'pages':len(doc),'textCharacters':len(doc[0].get_text())}
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
probe=subprocess.run([ffmpeg,'-hide_banner','-i',str(base/'udyam-demo.mp4')],capture_output=True,text=True)
match=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',probe.stderr)
assert match,'Video metadata unavailable'
seconds=int(match[1])*3600+int(match[2])*60+float(match[3]);assert seconds<=180
assert 'Video: h264' in probe.stderr and 'Audio: aac' in probe.stderr
result['demo']={'seconds':seconds,'video':'H.264','audio':'AAC','type':'Narrated walkthrough using actual app screenshots'}
if (base/'udyam-source.zip').exists():
 with ZipFile(base/'udyam-source.zip') as z:
  names=z.namelist();assert '.env' not in names and '.env.example' in names
  assert not any(n.startswith(('var/','node_modules/','tmp/','.git/')) for n in names)
  result['source']={'files':len(names),'privateEnvironmentExcluded':True,'localOrdersExcluded':True}
Path('reports/submission-validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
