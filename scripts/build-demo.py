from pathlib import Path
import json,subprocess,wave,shutil
import imageio_ffmpeg

segments=json.loads(Path('scripts/demo-narration.json').read_text(encoding='utf-8'))
work=Path('tmp/demo');out=Path('output/submission');out.mkdir(parents=True,exist_ok=True)
shutil.copyfile('C:/Windows/Fonts/arial.ttf',work/'font.ttf')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();duration=0;clips=[];subtitles=[]
def stamp(seconds):
 n=round(seconds*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
for i,segment in enumerate(segments,1):
 stem=segment['frame'];image=work/(stem+'.png');audio=work/(stem+'.wav')
 if not image.exists() or not audio.exists():raise RuntimeError('Missing captured frame or narration: '+stem)
 with wave.open(str(audio),'rb') as wav:seconds=wav.getnframes()/wav.getframerate()+0.8
 caption=work/(stem+'.txt');caption.write_text(segment['title'],encoding='utf-8');clip=work/(stem+'.mp4');clips.append(clip)
 filters=f"scale=1920:1008:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:0:color=0xf7f7f2,drawbox=x=0:y=1008:w=1920:h=72:color=0x173d2d:t=fill,drawtext=fontfile=tmp/demo/font.ttf:textfile={caption.as_posix()}:fontcolor=white:fontsize=32:x=48:y=1027"
 subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-loop','1','-framerate','10','-i',str(image),'-i',str(audio),'-vf',filters,'-af','apad=pad_dur=0.8','-t',str(seconds),'-r','10','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',str(clip)],check=True)
 subtitles.append(f'{i}\n{stamp(duration)} --> {stamp(duration+seconds)}\n{segment["title"]}\n');duration+=seconds
if duration>180:raise RuntimeError(f'Demo exceeds 3 minutes: {duration:.1f}s')
concat=work/'concat.txt';concat.write_text(''.join("file '"+clip.name+"'\n" for clip in clips),encoding='utf-8')
video=out/'udyam-demo.mp4'
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(video)],check=True)
(out/'udyam-demo.srt').write_text('\n'.join(subtitles),encoding='utf-8')
(work/'metadata.json').write_text(json.dumps({'durationSeconds':round(duration,2),'segments':len(segments),'format':'Narrated walkthrough using actual app screenshots; synthetic records only.','voice':'Microsoft David Desktop (local synthesis)'},indent=2),encoding='utf-8')
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-ss','20','-i',str(video),'-frames:v','1',str(work/'video-preview.png')],check=True)
print(f'Demo generated: {duration:.1f} seconds, {len(segments)} captured app screens.')
