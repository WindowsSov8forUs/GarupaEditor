#!/usr/bin/env python3
"""Verify current ordinary RhythmGame orthographic projection evidence."""
from __future__ import annotations
import hashlib,json,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];PROFILE=HERE/'resource_pixi_rendering_projection_profile.json';BUILDER=HERE/'build_resource_pixi_rendering_projection_profile.py';TRACE=HERE/'runtime'/'ordinary-rendering-geometry-r2.trace.json.gz'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 before=PROFILE.read_bytes();subprocess.run([sys.executable,str(BUILDER)],cwd=ROOT,check=True,capture_output=True);assert PROFILE.read_bytes()==before
 d=json.loads(before);assert d['status']=='confirmed-current-ordinary-rhythmgame-orthographic-projection' and d['unknown_fields']==[];assert d['source']['geometry_r2_sha256']==sha(TRACE);assert d['scene']=={'build_index':3,'path':'Assets/star/Scenes/RhythmGame.unity','camera_game_object':'GameCamera','camera_path_id':868,'transform_path_id':577,'parent_game_object':'GamePlay','parent_transform_path_id':544};assert d['camera']=={'orthographic':True,'orthographic_size':1.0,'near_clip':0.0,'far_clip':25.0,'position':[0.0,0.0,-15.0],'rotation':[0.0,0.0,0.0,1.0],'lossy_scale':[1.0,1.0,1.0],'normalized_viewport':[0.0,0.0,1.0,1.0]};assert d['mapping']['pixels_per_world_unit']==360.0 and d['mapping']['pixi_x']=='800 + world_x * 360' and d['mapping']['pixi_y']=='360 - world_y * 360' and d['mapping']['pixi_width']=='world_width * 360';r=d['r2_validation'];assert r['endpoint_writes']==24470 and r['width_writes']==12235 and r['outside_view_or_clip_count']==0;print('verified ordinary projection profile: endpoints=24470 viewport=1600x720')
if __name__=='__main__':main()
