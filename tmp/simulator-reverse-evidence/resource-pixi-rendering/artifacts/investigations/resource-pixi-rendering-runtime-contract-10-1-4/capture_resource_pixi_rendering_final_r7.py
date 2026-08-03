#!/usr/bin/env python3
"""One-shot privacy-minimal owner/setter capture for final R7 scenarios."""
from __future__ import annotations
import argparse,gzip,hashlib,json,subprocess,threading,time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
import frida
H=Path(__file__).resolve().parent;TARGETS=H/'resource_pixi_rendering_final_r7_targets.json';HUD_SETTERS=H/'resource_pixi_rendering_hud_setter_targets.json'
PACKAGE='jp.co.craftegg.band';ADB=r'HOST___________\scrcpy\adb.exe';SERIAL='FICIPZUGEIQC4P7H';SERVER='/data/local/tmp/frida-server-17.15.3';ADDRESS='127.0.0.1:27042'
GEOMETRY=[
 {'target_id':'R7S-G01','owner':'Mesh','method':'set_vertices','rva':'0x659CE48','payload_kind':'vector3-array'},
 {'target_id':'R7S-G02','owner':'Mesh','method':'set_uv','rva':'0x659D04C','payload_kind':'vector2-array'},
 {'target_id':'R7S-G03','owner':'Mesh','method':'set_colors','rva':'0x659D1B8','payload_kind':'color-array'},
 {'target_id':'R7S-G04','owner':'Mesh','method':'set_triangles','rva':'0x659DF00','payload_kind':'int32-array'},
 {'target_id':'R7S-G05','owner':'Material','method':'SetFloat','rva':'0x6596684','payload_kind':'material-float'},
 {'target_id':'R7S-G06','owner':'LineRenderer','method':'SetPosition','rva':'0x658BE54','payload_kind':'line-position'},
 {'target_id':'R7S-G07','owner':'LineRenderer','method':'SetWidth','rva':'0x658BB84','payload_kind':'line-width'},
 {'target_id':'R7S-G08','owner':'Transform','method':'set_position','rva':'0x65C97A8','payload_kind':'vector3-q0-q2'},
 {'target_id':'R7S-G09','owner':'Transform','method':'set_localPosition','rva':'0x65C8C58','payload_kind':'vector3-q0-q2'},
 {'target_id':'R7S-G10','owner':'Transform','method':'set_localScale','rva':'0x65CA1F8','payload_kind':'vector3-q0-q2'},
]
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def adb(*args,capture=True):
 r=subprocess.run([ADB,'-s',SERIAL,*args],check=True,capture_output=capture,text=True,encoding='utf-8',errors='replace');return r.stdout.strip() if capture else ''
def setters():
 rows=GEOMETRY+load(HUD_SETTERS)['targets'];out=[];seen=set()
 for x in rows:
  key=x['rva'].lower()
  if key in seen:continue
  seen.add(key);out.append({'target_id':x['target_id'],'owner':x['owner'],'method':x['method'],'rva':x['rva'],'payload_kind':x['payload_kind']})
 return out
def script_text(owners,setter_rows):
 return f"""'use strict';
const OWNERS={json.dumps(owners,separators=(',',':'))};const SETTERS={json.dumps(setter_rows,separators=(',',':'))};const events=[],failures=[],aliases=new Map(),active=new Map(),enters={{}};let sequence=0,frame=0;const MAX=600000,MAX_ARRAY=256;
function tk(){{return String(Process.getCurrentThreadId());}}function alias(prefix,p){{try{{if(!p||p.isNull())return null;const k=prefix+':'+p.toString();if(!aliases.has(k))aliases.set(k,prefix+'-'+String(aliases.size+1).padStart(5,'0'));return aliases.get(k);}}catch(_){{return null;}}}}
function push(o,p){{const k=tk(),s=active.get(k)||[];enters[o.target_id]=(enters[o.target_id]||0)+1;s.push({{target_id:o.target_id,role:o.owner+'.'+o.method,object_alias:alias('owner',p)}});active.set(k,s);if(o.owner==='Combo'&&o.method==='ExecUpdate')frame++;}}function pop(){{const k=tk(),s=active.get(k)||[];s.pop();if(s.length)active.set(k,s);else active.delete(k);}}function top(){{const s=active.get(tk());return s&&s.length?s[s.length-1]:null;}}
function h(v){{return ('00000000'+(v>>>0).toString(16).toUpperCase()).slice(-8);}}function q(c,n){{const b=c['q'+n];if(!(b instanceof ArrayBuffer)||b.byteLength<4)throw new Error('q-unavailable');return h(new DataView(b).getUint32(0,true));}}function str(p){{if(!p||p.isNull())return null;const n=p.add(0x10).readU32();if(n>64)return null;const s=p.add(0x14).readUtf16String(n);return /^[A-Za-z0-9_#./+ -]*$/.test(s)?s:null;}}
function alen(p){{if(!p||p.isNull())throw new Error('null-array');const n=p.add(0x18).readU32();if(n<1||n>MAX_ARRAY)throw new Error('array-range');return n;}}function fa(p,w){{const n=alen(p),d=p.add(0x20),r=[];for(let i=0;i<n;i++){{const x=[];for(let j=0;j<w;j++)x.push(h(d.add((i*w+j)*4).readU32()));r.push(x);}}return r;}}function ia(p){{const n=alen(p),d=p.add(0x20),r=[];for(let i=0;i<n;i++)r.push(d.add(i*4).readS32());return r;}}
function payload(t,a,c){{switch(t.payload_kind){{case'vector3-array':return{{vertex_f32_bits:fa(a[1],3)}};case'vector2-array':return{{uv_f32_bits:fa(a[1],2)}};case'color-array':return{{color_f32_bits:fa(a[1],4)}};case'int32-array':return{{index_i32:ia(a[1])}};case'material-float':return{{property_id:a[1].toInt32(),value_f32_bits:q(c,0)}};case'line-position':return{{index:a[1].toInt32(),position_f32_bits:[q(c,0),q(c,1),q(c,2)]}};case'line-width':return{{start_width_f32_bits:q(c,0),end_width_f32_bits:q(c,1)}};case'technical-string':return{{technical_value:str(a[1])}};case'float-q0':return{{value_f32_bits:q(c,0)}};case'color-q0-q3':return{{color_f32_bits:[q(c,0),q(c,1),q(c,2),q(c,3)]}};case'int-arg1':return{{value_i32:a[1].toInt32()}};case'bool-arg1':return{{enabled:a[1].toInt32()!==0}};case'vector3-q0-q2':return{{value_f32_bits:[q(c,0),q(c,1),q(c,2)]}};case'animator-play-hash-layer-time':return{{state_hash:a[1].toInt32(),layer:a[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-string-layer':return{{technical_value:str(a[1]),layer:a[2].toInt32()}};case'animator-play-string-layer-time':return{{technical_value:str(a[1]),layer:a[2].toInt32(),normalized_time_f32_bits:q(c,0)}};case'animator-play-hash-layer':return{{state_hash:a[1].toInt32(),layer:a[2].toInt32()}};case'animator-play-hash':return{{state_hash:a[1].toInt32()}};default:throw new Error('unknown-kind');}}}}
const m=Process.findModuleByName('libil2cpp.so');if(!m)throw new Error('libil2cpp-missing');for(const o of OWNERS)try{{Interceptor.attach(m.base.add(parseInt(o.rva,16)),{{onEnter(a){{push(o,a[0]);}},onLeave(){{pop();}}}});}}catch(_){{failures.push({{target_id:o.target_id,error_category:'owner-hook-install-failed'}});}}for(const t of SETTERS)try{{Interceptor.attach(m.base.add(parseInt(t.rva,16)),{{onEnter(a){{const o=top();if(!o||events.length>=MAX)return;try{{events.push({{sequence:sequence++,frame,owner_target_id:o.target_id,owner_role:o.role,owner_object_alias:o.object_alias,setter_id:t.target_id,setter_role:t.owner+'.'+t.method,component_alias:alias('component',a[0]),payload:payload(t,a,this.context)}});}}catch(e){{failures.push({{target_id:t.target_id,error_category:String(e.message||e)}});}}}}}});}}catch(_){{failures.push({{target_id:t.target_id,error_category:'setter-hook-install-failed'}});}}rpc.exports.drain=()=>events.splice(0,events.length);rpc.exports.summary=()=>({{queued:events.length,failures,alias_count:aliases.size,relative_frame:frame,owner_enter_counts:enters}});"""
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--owner-group',required=True,choices=['note','field','hud-core','hud-overlay','all']);ap.add_argument('--scenario-id',required=True);ap.add_argument('--already-running-live',action='store_true');ap.add_argument('--start-x',type=int,default=1240);ap.add_argument('--start-y',type=int,default=590);ap.add_argument('--post-start-attach-delay',type=float,default=7);ap.add_argument('--server-delay',type=float,default=1.5);ap.add_argument('--duration',type=float,default=150);ap.add_argument('--device-address',default=ADDRESS);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
 package=adb('shell','dumpsys','package',PACKAGE);assert 'versionName=10.1.4' in package and 'versionCode=230' in package;assert adb('shell','getenforce')=='Enforcing';td=load(TARGETS);selected=td['targets'] if a.owner_group=='all' else [x for x in td['targets'] if x['owner_group']==a.owner_group];anchor=[x for x in td['targets'] if x['owner']=='Combo' and x['method']=='ExecUpdate'];owners={x['target_id']:x for x in selected+anchor};owner_rows=[{'target_id':x['target_id'],'owner':x['owner'],'method':x['method'],'rva':x['rva']} for x in owners.values()];actions={'os_ui_start_tap':False,'natural_live_observed':False,'post_bootstrap_attach':True,'wait_completed':False}
 if not a.already_running_live:adb('shell','input','tap',str(a.start_x),str(a.start_y),capture=False);actions['os_ui_start_tap']=True;time.sleep(a.post_start_attach_delay)
 actions['natural_live_observed']=True;adb('shell','su','-c',f'nohup {SERVER} -l {ADDRESS} >/data/local/tmp/frida-r7.log 2>&1 &');time.sleep(a.server_delay);adb('forward','tcp:27042','tcp:27042');pid=int(adb('shell','pidof',PACKAGE));device=frida.get_device_manager().add_remote_device(a.device_address);session=device.attach(pid);script=session.create_script(script_text(owner_rows,setters()));messages=[];script.on('message',lambda m,d:messages.append(m));script.load();events=[];stop=threading.Event();error=None
 def drain():
  nonlocal error
  while not stop.wait(.15):
   try:events.extend(script.exports_sync.drain())
   except Exception as e:error=f'{type(e).__name__}:{e}';return
 th=threading.Thread(target=drain,daemon=True);th.start();started=datetime.now(timezone.utc).isoformat()
 try:time.sleep(a.duration);actions['wait_completed']=True
 except Exception as e:error=f'{type(e).__name__}:{e}'
 finally:
  stop.set();th.join(3)
  try:events.extend(script.exports_sync.drain());summary=script.exports_sync.summary()
  except Exception as e:error=error or f'{type(e).__name__}:{e}';summary={'failures':[{'error_category':'rpc-summary-failed'}]}
  try:session.detach()
  except Exception:pass
 events.sort(key=lambda x:x['sequence']);[x.__setitem__('sequence',i) for i,x in enumerate(events)];oc=Counter(x['owner_target_id'] for x in events);sc=Counter(x['setter_id'] for x in events);non_anchor={x['target_id'] for x in selected}-{x['target_id'] for x in anchor};complete=error is None and not summary.get('failures') and len(events)>0 and bool(non_anchor & set(oc)) and summary.get('relative_frame',0)>0
 doc={'schema_version':1,'status':'confirmed-current-final-r7-observation-only' if complete else 'partial-current-final-r7-observation-only','sample':td['sample'],'scenario_id':a.scenario_id,'owner_group':a.owner_group,'source':{'targets_sha256':sha(TARGETS),'hud_setters_sha256':sha(HUD_SETTERS),'capture_script_sha256':sha(Path(__file__))},'capture':{'started_utc':started,'finished_utc':datetime.now(timezone.utc).isoformat(),'selinux':'Enforcing','transport':'device-loopback-frida-after-natural-start','return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False,'synthetic_in_process_event_injection':False,'os_ui_navigation_only':True,'actions':actions,'error':error,'hook_failures':summary.get('failures',[]),'frida_message_count':len(messages)},'privacy':{'account_fields':False,'room_identity':False,'member_card_skill_identity':False,'raw_pointer':False,'display_string':False},'summary':{'completion_requirements_met':complete,'event_count':len(events),'relative_frame_count':summary.get('relative_frame',0),'alias_count':summary.get('alias_count',0),'owner_event_counts':dict(sorted(oc.items())),'owner_enter_counts':dict(sorted(summary.get('owner_enter_counts',{}).items())),'setter_event_counts':dict(sorted(sc.items()))},'events':events}
 a.output.parent.mkdir(parents=True,exist_ok=True);raw=(json.dumps(doc,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode();a.output.write_bytes(gzip.compress(raw,9));print(json.dumps({'status':doc['status'],'scenario':a.scenario_id,'events':len(events),'frames':doc['summary']['relative_frame_count'],'owners':len(oc)},ensure_ascii=False));return 0 if complete else 2
if __name__=='__main__':raise SystemExit(main())
