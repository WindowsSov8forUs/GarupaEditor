#!/usr/bin/env python3
"""Capture caller-correlated HUD/overlay/field setters during one natural 10.1.4 Live."""
from __future__ import annotations
import argparse,gzip,hashlib,json,subprocess,threading,time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
import frida
H=Path(__file__).resolve().parent;TARGETS=H/'resource_pixi_rendering_hud_field_r5_targets.json';SETTERS=H/'resource_pixi_rendering_hud_setter_targets.json'
PACKAGE='jp.co.craftegg.band';ADB=r'HOST___________\scrcpy\adb.exe';SERIAL='FICIPZUGEIQC4P7H';SERVER='/data/local/tmp/frida-server-17.15.3';ADDRESS='127.0.0.1:27042'
GROUPS={'core':{'frame','core'},'overlay':{'frame','overlay'},'field':{'frame','field'},'all':{'frame','core','overlay','field'}}
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def adb(*args,capture=True):
 r=subprocess.run([ADB,'-s',SERIAL,*args],check=True,capture_output=capture,text=True,encoding='utf-8',errors='replace');return r.stdout.strip() if capture else ''
def script_text(owners,setters):
 return f"""'use strict';
const OWNERS={json.dumps(owners,separators=(',',':'))};const SETTERS={json.dumps(setters,separators=(',',':'))};const events=[],failures=[],aliases=new Map(),active=new Map(),ownerCounts={{}};let sequence=0,frame=0;const MAX=180000;
function key(){{return String(Process.getCurrentThreadId());}}function alias(prefix,p){{try{{if(!p||p.isNull())return null;const k=prefix+':'+p.toString();if(!aliases.has(k))aliases.set(k,prefix+'-'+String(aliases.size+1).padStart(4,'0'));return aliases.get(k);}}catch(_){{return null;}}}}
function push(o,p){{const k=key(),s=active.get(k)||[];ownerCounts[o.target_id]=(ownerCounts[o.target_id]||0)+1;s.push({{target_id:o.target_id,role:o.owner+'.'+o.method,object_alias:alias('owner',p)}});active.set(k,s);}}function pop(){{const k=key(),s=active.get(k)||[];s.pop();if(s.length)active.set(k,s);else active.delete(k);}}function top(){{const s=active.get(key());return s&&s.length?s[s.length-1]:null;}}
function h(v){{return ('00000000'+(v>>>0).toString(16).toUpperCase()).slice(-8);}}function q(c,n){{const b=c['q'+n];if(!(b instanceof ArrayBuffer))throw new Error('q-unavailable');return h(new DataView(b).getUint32(0,true));}}function str(p){{if(!p||p.isNull())return null;const n=p.add(0x10).readU32();if(n>64)return null;const s=p.add(0x14).readUtf16String(n);return /^[A-Za-z0-9_#./+ -]*$/.test(s)?s:null;}}
function payload(t,a,c){{switch(t.payload_kind){{case'technical-string':return{{technical_value:str(a[1])}};case'float-q0':return{{value_f32_bits:q(c,0)}};case'color-q0-q3':return{{color_f32_bits:[q(c,0),q(c,1),q(c,2),q(c,3)]}};case'int-arg1':return{{value_i32:a[1].toInt32()}};case'bool-arg1':return{{enabled:a[1].toInt32()!==0}};case'animator-play-hash-layer-time':return{{state_hash:a[1].toInt32(),layer:a[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-string-layer':return{{technical_value:str(a[1]),layer:a[2].toInt32()}};case'animator-play-string-layer-time':return{{technical_value:str(a[1]),layer:a[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-hash-layer':return{{state_hash:a[1].toInt32(),layer:a[2].toInt32()}};case'animator-play-hash':return{{state_hash:a[1].toInt32()}};case'vector3-q0-q2':return{{value_f32_bits:[q(c,0),q(c,1),q(c,2)]}};default:throw new Error('unknown-kind');}}}}
const m=Process.findModuleByName('libil2cpp.so');for(const o of OWNERS)try{{Interceptor.attach(m.base.add(parseInt(o.rva,16)),{{onEnter(a){{push(o,a[0]);if(o.target_id==='RPH5-000')frame++;}},onLeave(){{pop();}}}});}}catch(_){{failures.push({{target_id:o.target_id,error_category:'owner-hook'}});}}for(const t of SETTERS)try{{Interceptor.attach(m.base.add(parseInt(t.rva,16)),{{onEnter(a){{const o=top();if(!o||events.length>=MAX)return;try{{events.push({{sequence:sequence++,frame,owner_target_id:o.target_id,owner_role:o.role,owner_object_alias:o.object_alias,setter_id:t.target_id,setter_role:t.owner+'.'+t.method,component_alias:alias('component',a[0]),payload:payload(t,a,this.context)}});}}catch(e){{failures.push({{target_id:t.target_id,error_category:String(e.message||e)}});}}}}}});}}catch(_){{failures.push({{target_id:t.target_id,error_category:'setter-hook'}});}}rpc.exports.drain=()=>events.splice(0,events.length);rpc.exports.summary=()=>({{queued:events.length,failures,alias_count:aliases.size,frame,owner_enter_counts:ownerCounts}});"""
def tap(x,y):adb('shell','input','tap',str(x),str(y),capture=False)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--owner-group',required=True,choices=sorted(GROUPS));ap.add_argument('--device-address',default=ADDRESS);ap.add_argument('--already-running-live',action='store_true');ap.add_argument('--start-x',type=int,default=1240);ap.add_argument('--start-y',type=int,default=590);ap.add_argument('--post-start-attach-delay',type=float,default=14);ap.add_argument('--server-delay',type=float,default=2);ap.add_argument('--finish-after-resume',type=float,default=145);ap.add_argument('--output',type=Path);a=ap.parse_args();a.output=a.output or H/f'runtime/ordinary-rendering-hud-field-r5-{a.owner_group}.trace.json.gz'
 package=adb('shell','dumpsys','package',PACKAGE);assert 'versionName=10.1.4' in package and 'versionCode=230' in package;assert adb('shell','getenforce')=='Enforcing';td=load(TARGETS);sd=load(SETTERS);owners=[x for x in td['targets'] if x['owner_group'] in GROUPS[a.owner_group]];setters=sd['targets'];actions={'natural_live_started':False,'start_tap_issued':False,'post_start_attach_wait_completed':False,'wait_completed':False}
 if not a.already_running_live:tap(a.start_x,a.start_y);actions['start_tap_issued']=True;time.sleep(a.post_start_attach_delay)
 actions['natural_live_started']=True;actions['post_start_attach_wait_completed']=True;adb('shell','su','-c',f'nohup {SERVER} -l {ADDRESS} >/data/local/tmp/frida-r5.log 2>&1 &');time.sleep(a.server_delay);adb('forward','tcp:27042','tcp:27042');pid=int(adb('shell','pidof',PACKAGE));device=frida.get_device_manager().add_remote_device(a.device_address);session=device.attach(pid);script=session.create_script(script_text(owners,setters));messages=[];script.on('message',lambda m,d:messages.append(m));script.load();collected=[];stop=threading.Event();error=None
 def drain():
  nonlocal error
  while not stop.wait(.2):
   try:collected.extend(script.exports_sync.drain())
   except Exception as e:error=f'{type(e).__name__}:{e}';return
 th=threading.Thread(target=drain,daemon=True);th.start();started=datetime.now(timezone.utc).isoformat()
 try:time.sleep(a.finish_after_resume);actions['wait_completed']=True
 except Exception as e:error=f'{type(e).__name__}:{e}'
 finally:
  stop.set();th.join(3)
  try:collected.extend(script.exports_sync.drain());summary=script.exports_sync.summary()
  except Exception as e:error=error or f'{type(e).__name__}:{e}';summary={'failures':[{'error_category':'rpc-summary-failed'}]}
  try:session.detach()
  except Exception:pass
 collected.sort(key=lambda x:x['sequence']);[x.__setitem__('sequence',i) for i,x in enumerate(collected)];oc=Counter(x['owner_target_id'] for x in collected);sc=Counter(x['setter_id'] for x in collected);complete=error is None and not summary.get('failures') and summary.get('frame',0)>0
 doc={'schema_version':1,'status':'confirmed-current-hud-field-r5-observation-only' if complete else 'partial-current-hud-field-r5-observation-only','sample':{'package':PACKAGE,'version_name':'10.1.4','version_code':230,'abi':'arm64-v8a'},'owner_group':a.owner_group,'capture':{'started_utc':started,'finished_utc':datetime.now(timezone.utc).isoformat(),'device_serial_sha256':hashlib.sha256(SERIAL.encode()).hexdigest().upper(),'selinux':'Enforcing','transport':'device-loopback-frida-after-natural-start','return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False,'synthetic_event_injection':False,'actions':actions,'error':error,'messages':messages,'hook_failures':summary.get('failures',[])},'source':{'owner_targets_sha256':sha(TARGETS),'setter_targets_sha256':sha(SETTERS),'capture_script_sha256':sha(Path(__file__))},'summary':{'event_count':len(collected),'relative_frame_count':summary.get('frame',0),'alias_count':summary.get('alias_count',0),'owner_event_counts':dict(sorted(oc.items())),'owner_enter_counts':dict(sorted(summary.get('owner_enter_counts',{}).items())),'setter_event_counts':dict(sorted(sc.items())),'completion_requirements_met':complete},'events':collected}
 a.output.parent.mkdir(exist_ok=True);a.output.write_bytes(gzip.compress((json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n').encode(),9));print(doc['status'],len(collected),summary.get('frame',0),dict(oc));return 0 if complete else 1
if __name__=='__main__':raise SystemExit(main())
