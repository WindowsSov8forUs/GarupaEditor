#!/usr/bin/env python3
"""Build the current ordinary RhythmGame orthographic projection profile."""
from __future__ import annotations
import gzip,hashlib,json,struct,zipfile
from pathlib import Path
import UnityPy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];APK=ROOT/'samples/jp.co.craftegg.band'/'10.1.4_230'/'original'/'base.apk';TRACE=HERE/'runtime'/'ordinary-rendering-geometry-r2.trace.json.gz';OUT=HERE/'resource_pixi_rendering_projection_profile.json'
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def f32(bits):return struct.unpack('>f',bytes.fromhex(bits))[0]
def main():
 with zipfile.ZipFile(APK) as z: level=z.read('assets/bin/Data/level3');ggm=z.read('assets/bin/Data/globalgamemanagers')
 scene=UnityPy.load(level);by={o.path_id:o for o in scene.objects};camera=by[868].read_typetree();transform=by[577].read_typetree();parent=by[544].read_typetree();build=next(o.read_typetree() for o in UnityPy.load(ggm).objects if o.type.name=='BuildSettings')
 assert build['scenes'][3]=='Assets/star/Scenes/RhythmGame.unity';assert by[camera['m_GameObject']['m_PathID']].read_typetree()['m_Name']=='GameCamera';assert camera['orthographic'] is True and camera['orthographic size']==1.0 and camera['near clip plane']==0.0 and camera['far clip plane']==25.0
 assert transform['m_LocalPosition']=={'x':0.0,'y':0.0,'z':-15.0} and transform['m_LocalRotation']=={'x':0.0,'y':0.0,'z':0.0,'w':1.0} and transform['m_LocalScale']=={'x':1.0,'y':1.0,'z':1.0};assert parent['m_LocalScale']=={'x':1.0,'y':1.0,'z':1.0}
 with gzip.open(TRACE,'rt',encoding='utf-8') as s:trace=json.load(s)
 xs=[];ys=[];depth=[];width=[]
 for e in trace['events']:
  if e['setter_id']=='RPS-006':
   x,y,z=map(f32,e['payload']['position_f32_bits']);xs.append(800+x*360);ys.append(360-y*360);depth.append(z+15)
  elif e['setter_id']=='RPS-007':width.append(f32(e['payload']['start_width_f32_bits'])*360)
 assert len(xs)==24470 and len(width)==12235 and all(0<=x<=1600 for x in xs) and all(0<=y<=720 for y in ys) and all(0<=z<=25 for z in depth)
 doc={'schema_version':1,'status':'confirmed-current-ordinary-rhythmgame-orthographic-projection','sample':{'package':'jp.co.craftegg.band','version_name':'10.1.4','version_code':230,'abi':'arm64-v8a'},'source':{'base_apk_sha256':sha(APK.read_bytes()),'level3_sha256':sha(level),'globalgamemanagers_sha256':sha(ggm),'geometry_r2_path':'runtime/ordinary-rendering-geometry-r2.trace.json.gz','geometry_r2_sha256':sha(TRACE.read_bytes())},'scene':{'build_index':3,'path':build['scenes'][3],'camera_game_object':'GameCamera','camera_path_id':868,'transform_path_id':577,'parent_game_object':'GamePlay','parent_transform_path_id':544},'camera':{'orthographic':True,'orthographic_size':1.0,'near_clip':0.0,'far_clip':25.0,'position':[0.0,0.0,-15.0],'rotation':[0.0,0.0,0.0,1.0],'lossy_scale':[1.0,1.0,1.0],'normalized_viewport':[0.0,0.0,1.0,1.0]},'portable_viewport':{'width':1600,'height':720,'pixi_origin':'top-left'},'mapping':{'pixels_per_world_unit':360.0,'pixi_x':'800 + world_x * 360','pixi_y':'360 - world_y * 360','camera_depth':'world_z + 15','pixi_width':'world_width * 360','float_policy':'consume source Float32 value then widen for projection; no clamp'},'r2_validation':{'endpoint_writes':len(xs),'width_writes':len(width),'projected_x_range':[min(xs),max(xs)],'projected_y_range':[min(ys),max(ys)],'camera_depth_range':[min(depth),max(depth)],'projected_width_range':[min(width),max(width)],'outside_view_or_clip_count':0},'limits':['profile is fixed to ordinary 1600x720 physical-frame oracle','HABAHIRO projection is not implied','Unity GPU raster and threshold clipping are not implied'],'unknown_fields':[]}
 OUT.write_text(json.dumps(doc,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8');print('built ordinary projection profile')
if __name__=='__main__':main()
