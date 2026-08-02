#!/usr/bin/env python3
"""Capture privacy-minimal HUD/mask/animation setter R3 during a natural ordinary Live."""
from __future__ import annotations
import argparse,gzip,hashlib,json,subprocess,threading,time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
import frida
HERE=Path(__file__).resolve().parent
TARGETS=HERE/'resource_pixi_rendering_hud_setter_targets.json'
OWNERS=HERE/'resource_pixi_rendering_runtime_hook_targets.json'
PACKAGE='jp.co.craftegg.band';ADB=r'HOST___________\scrcpy\adb.exe';SERIAL='FICIPZUGEIQC4P7H'
OWNER_IDS={f'RPH-{i:03d}' for i in range(30,56)}
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def adb(*args,capture=True):
 r=subprocess.run([ADB,'-s',SERIAL,*args],check=True,capture_output=capture,text=True,encoding='utf-8',errors='replace');return r.stdout.strip() if capture else ''
def script_text(owners,setters):
 return f"""'use strict';
const OWNERS={json.dumps(owners,separators=(',',':'))};const SETTERS={json.dumps(setters,separators=(',',':'))};
const events=[],failures=[],aliases=new Map(),active=new Map();let sequence=0,frame=0;
function key(){{return String(Process.getCurrentThreadId());}}
function alias(prefix,p){{try{{if(!p||p.isNull())return null;const k=prefix+':'+p.toString();if(!aliases.has(k))aliases.set(k,prefix+'-'+String(aliases.size+1).padStart(4,'0'));return aliases.get(k);}}catch(_){{return null;}}}}
function push(o,p){{const k=key(),s=active.get(k)||[];s.push({{target_id:o.target_id,role:o.owner+'.'+o.method,object_alias:alias('owner',p)}});active.set(k,s);}}
function pop(){{const k=key(),s=active.get(k)||[];s.pop();if(s.length)active.set(k,s);else active.delete(k);}}
function top(){{const s=active.get(key());return s&&s.length?s[s.length-1]:null;}}
function h(v){{return ('00000000'+(v>>>0).toString(16).toUpperCase()).slice(-8);}}
function q(c,n){{const b=c['q'+n];if(!(b instanceof ArrayBuffer))throw new Error('q-unavailable');return h(new DataView(b).getUint32(0,true));}}
function str(p){{if(!p||p.isNull())return null;const n=p.add(0x10).readU32();if(n>64)return null;const s=p.add(0x14).readUtf16String(n);return /^[A-Za-z0-9_#./+ -]*$/.test(s)?s:null;}}
function payload(t,args,c){{switch(t.payload_kind){{case'technical-string':return{{technical_value:str(args[1])}};case'float-q0':return{{value_f32_bits:q(c,0)}};case'color-q0-q3':return{{color_f32_bits:[q(c,0),q(c,1),q(c,2),q(c,3)]}};case'int-arg1':return{{value_i32:args[1].toInt32()}};case'bool-arg1':return{{enabled:args[1].toInt32()!==0}};case'animator-play-hash-layer-time':return{{state_hash:args[1].toInt32(),layer:args[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-string-layer':return{{technical_value:str(args[1]),layer:args[2].toInt32()}};case'animator-play-string-layer-time':return{{technical_value:str(args[1]),layer:args[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-hash-layer':return{{state_hash:args[1].toInt32(),layer:args[2].toInt32()}};case'animator-play-hash':return{{state_hash:args[1].toInt32()}};case'vector3-q0-q2':return{{value_f32_bits:[q(c,0),q(c,1),q(c,2)]}};default:throw new Error('kind');}}}}
const m=Process.findModuleByName('libil2cpp.so');
for(const o of OWNERS)try{{Interceptor.attach(m.base.add(parseInt(o.rva,16)),{{onEnter(a){{push(o,a[0]);if(o.target_id==='RPH-036')frame++;}},onLeave(){{pop();}}}});}}catch(_){{failures.push({{target_id:o.target_id,error_category:'owner-hook'}});}}
for(const t of SETTERS)try{{Interceptor.attach(m.base.add(parseInt(t.rva,16)),{{onEnter(a){{const o=top();if(!o||events.length>=160000)return;try{{events.push({{sequence:sequence++,frame,owner_target_id:o.target_id,owner_role:o.role,owner_object_alias:o.object_alias,setter_id:t.target_id,setter_role:t.owner+'.'+t.method,component_alias:alias('component',a[0]),payload:payload(t,a,this.context)}});}}catch(e){{failures.push({{target_id:t.target_id,error_category:String(e.message||e)}});}}}}}});}}catch(_){{failures.push({{target_id:t.target_id,error_category:'setter-hook'}});}}
rpc.exports.drain=()=>events.splice(0,events.length);rpc.exports.summary=()=>({{queued:events.length,failures,alias_count:aliases.size,frame}});"""
def tap(x,y):adb('shell','input','tap',str(x),str(y),capture=False)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--device-address',default='127.0.0.1:27042');ap.add_argument('--finish-after-resume',type=float,default=150);ap.add_argument('--output',type=Path,default=HERE/'runtime/ordinary-rendering-hud-r3.trace.json.gz');args=ap.parse_args()
 package=adb('shell','dumpsys','package',PACKAGE);assert 'versionName=10.1.4' in package and 'versionCode=230' in package;assert adb('shell','getenforce')=='Enforcing'
 td=load(TARGETS);od=load(OWNERS);owners=[r for r in od['targets'] if r['target_id'] in OWNER_IDS];setters=td['targets'];pid=int(adb('shell','pidof',PACKAGE));device=frida.get_device_manager().add_remote_device(args.device_address);session=device.attach(pid);script=session.create_script(script_text(owners,setters));messages=[];script.on('message',lambda m,d:messages.append(m));script.load()
 collected=[];stop=threading.Event();error=None
 def drain():
  nonlocal error
  while not stop.wait(.2):
   try:collected.extend(script.exports_sync.drain())
   except Exception as e:error=f'{type(e).__name__}:{e}';return
 th=threading.Thread(target=drain,daemon=True);th.start();started=datetime.now(timezone.utc).isoformat();actions={}
 try:
  tap(800,507);actions['demo_settings_closed']=True;actions['auto_live_enabled']=True;time.sleep(1);tap(1240,590);actions['natural_live_started']=True;time.sleep(args.finish_after_resume);actions['result_wait_completed']=True
 except Exception as e:error=f'{type(e).__name__}:{e}'
 finally:
  stop.set();th.join(3)
  try:collected.extend(script.exports_sync.drain());summary=script.exports_sync.summary()
  except Exception as e:error=error or f'{type(e).__name__}:{e}';summary={'failures':[{'error_category':'rpc'}]}
  session.detach()
 collected.sort(key=lambda r:r['sequence'])
 for i,r in enumerate(collected):r['sequence']=i
 counts=Counter(r['setter_id'] for r in collected)
 doc={'schema_version':1,'status':'captured-current-ordinary-hud-r3-observation-only' if not error else 'capture-failed','sample':{'package':PACKAGE,'version_name':'10.1.4','version_code':230,'abi':'arm64-v8a'},'capture':{'started_utc':started,'finished_utc':datetime.now(timezone.utc).isoformat(),'device_serial_sha256':hashlib.sha256(SERIAL.encode()).hexdigest().upper(),'selinux':'Enforcing','transport':'loopback-frida','return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False,'actions':actions,'error':error,'messages':messages,'hook_failures':summary.get('failures',[])},'source':{'setter_targets_sha256':sha(TARGETS),'owner_targets_sha256':sha(OWNERS)},'summary':{'event_count':len(collected),'relative_frame_count':summary.get('frame',0),'alias_count':summary.get('alias_count',0),'setter_event_counts':dict(sorted(counts.items()))},'events':collected}
 args.output.parent.mkdir(exist_ok=True);args.output.write_bytes(gzip.compress((json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n').encode(),compresslevel=9));print(doc['status'],len(collected),dict(counts));return 0 if not error else 1
if __name__=='__main__':raise SystemExit(main())
