"""Local-only audio QA server. Does not change the production build or playlist.
Run: python tests/serve_audio_fixture.py --port 4322
"""
import argparse
import html
import io
import json
import math
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import struct
import wave

ROOT = Path(__file__).resolve().parents[1] / 'dist'
TRACKS = [
 {'id':'qa-a','title':'测试音频 A','artist':'仅用于本地验收','src':'/__qa/a.wav'},
 {'id':'qa-b','title':'测试音频 B','artist':'仅用于本地验收','src':'/__qa/b.wav'},
 {'id':'qa-retry','title':'失败后重试测试','artist':'首次请求失败，重试恢复','src':'/__qa/retry.wav'},
]
def tone(frequency):
 stream=io.BytesIO()
 with wave.open(stream,'wb') as wav:
  wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000)
  wav.writeframes(b''.join(struct.pack('<h',int(300*math.sin(2*math.pi*frequency*i/16000))) for i in range(16000*120)))
 return stream.getvalue()
AUDIO={'a.wav':tone(220),'b.wav':tone(330),'retry.wav':tone(440)}
class Handler(SimpleHTTPRequestHandler):
 failed_once=False
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  if self.path.startswith('/__qa/'):
   name=self.path.split('/')[-1]
   if name=='retry.wav' and not Handler.failed_once:
    Handler.failed_once=True;self.send_error(503,'Intentional first-request failure');return
   data=AUDIO.get(name)
   if data is None:self.send_error(404);return
   start,end=0,len(data)-1
   ranged=self.headers.get('Range','')
   if ranged.startswith('bytes='):
    bounds=ranged[6:].split('-',1);start=int(bounds[0] or 0)
    if bounds[1]:end=min(int(bounds[1]),end)
    if start> end:self.send_error(416);return
   self.send_response(206 if ranged else 200)
   self.send_header('Content-Type','audio/wav');self.send_header('Accept-Ranges','bytes')
   if ranged:self.send_header('Content-Range',f'bytes {start}-{end}/{len(data)}')
   self.send_header('Content-Length',str(end-start+1));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data[start:end+1]);return
  path=Path(self.translate_path(self.path))
  if path.is_dir():path=path/'index.html'
  if path.suffix=='.html' and path.is_file():
   content=path.read_text('utf-8').replace('data-playlist="[]"','data-playlist="'+html.escape(json.dumps(TRACKS,ensure_ascii=False),quote=True)+'"')
   data=content.encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
  super().do_GET()
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4322);args=parser.parse_args()
 print(f'Audio QA: http://127.0.0.1:{args.port}',flush=True)
 ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
