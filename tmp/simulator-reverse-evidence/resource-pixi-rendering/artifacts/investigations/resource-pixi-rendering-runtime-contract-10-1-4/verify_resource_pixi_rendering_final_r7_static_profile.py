#!/usr/bin/env python3
"""Verify final R7 current static/asset/shader portable profile."""
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];P=H/'resource_pixi_rendering_final_r7_static_profile.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-final-r7-static-portable-profile';assert d['unknown_fields']==[] and d['blocking_findings']==[]
 source={'targets_sha256':'resource_pixi_rendering_final_r7_targets.json','static_contract_sha256':'resource_pixi_rendering_static_contract.json','instruction_migration_sha256':'resource_pixi_rendering_instruction_migration.json','resource_contract_sha256':'resource_pixi_rendering_resource_contract.json','hud_assets_sha256':'resource_pixi_rendering_hud_asset_profiles.json','skill_animations_sha256':'resource_pixi_rendering_skill_animation_profiles.json','note_animations_sha256':'resource_pixi_rendering_note_animation_profiles.json','score_up_sha256':'resource_pixi_rendering_score_up_profile.json'}
 for k,p in source.items():assert d['source'][k]==sha(H/p)
 lib=ROOT/'samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so';assert d['source']['libil2cpp_sha256']==sha(lib)=='815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F'
 assert d['advanced_mesh']=={'vertex_count':42,'triangle_index_count':120,'uv_pair_count':21,'section_count':20,'uv_v_step':0.05,'allocation_immediates':{'vertices':'0x2A','indices':'0x78'},'mapping':'same semantic strip producer with 20 sections; current ARM64 exact'}
 shader=d['shader'];assert shader['asset_sha256']==sha(ROOT/'tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data'/Path(shader['asset_file']));assert shader['threshold_default']==750.0;assert shader['properties']==['_MainTex','_Threshold'];assert len(shader['programs'])==8;assert any(x['threshold_compare'] and x['threshold_alpha_select'] for x in shader['programs']);assert any(x['lod200_alpha_constants_present'] for x in shader['programs']);assert shader['portable_semantic']['top_left_visible_condition']=='pixel_y >= viewport_height - threshold'
 methods=[x for rows in d['methods'].values() for x in rows];assert len(methods)==37
 for x in methods:assert re.fullmatch(r'[0-9A-F]{64}',x['arm64_sha256']);assert sha(H/x['arm64_tsv'])==x['arm64_tsv_sha256']
 assert d['hud']['add_score']['pool_size']==4 and d['hud']['add_score']['depth_cycle']==8;assert d['hud']['score']['max_digits']==8;assert d['hud']['score_up_type_5']['full_digit_and_decimal_layout_recovered'] is True;assert d['hud']['life']['warning_threshold']==0.25;assert d['hud']['animations']['damage_guard']['loop_time'] is True;assert all(d['authorization'].values())
 print(f"verified R7 static profile: methods={len(methods)} shader-programs={len(shader['programs'])} authorization={len(d['authorization'])}")
if __name__=='__main__':main()
