#!/usr/bin/env python3
"""Verify the current ordinary Note geometry producer profile and byte-idempotent builder."""
from __future__ import annotations
import hashlib,json,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
PROFILE=HERE/'resource_pixi_rendering_note_geometry_profile.json'
BUILDER=HERE/'build_resource_pixi_rendering_note_geometry_profile.py'
def load(path):return json.loads(path.read_text(encoding='utf-8'),parse_constant=lambda value:(_ for _ in ()).throw(ValueError(value)))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def arm64_sha(path):
 rows=path.read_text(encoding='utf-8').splitlines()[1:]
 return hashlib.sha256(b''.join(bytes.fromhex(row.split('\t')[1]) for row in rows)).hexdigest().upper()
def main():
 before=PROFILE.read_bytes();subprocess.run([sys.executable,str(BUILDER)],check=True,cwd=HERE.parents[2],capture_output=True);assert PROFILE.read_bytes()==before
 d=load(PROFILE);assert d['status']=='confirmed-current-ordinary-note-geometry-producer-profile' and d['unknown_fields']==[]
 assert len(d['methods'])==17 and sum(r['instruction_status']=='changed-semantic-instruction-shape' for r in d['methods'])==1
 assert next(r for r in d['methods'] if r['method']=='GetMeshWidthRate')['current_specific_differences'][0]['target']['normalized'][1][1][3]==784
 for row in d['methods']:
  assert arm64_sha(HERE/row['arm64_evidence'])==row['arm64_sha256']
 for key,name in [('static_contract_sha256','resource_pixi_rendering_static_contract.json'),('instruction_migration_sha256','resource_pixi_rendering_instruction_migration.json'),('geometry_oracle_sha256','resource_pixi_rendering_geometry_oracle.json'),('line_profile_sha256','resource_pixi_rendering_line_profile.json'),('projection_profile_sha256','resource_pixi_rendering_projection_profile.json')]:assert d['source'][key]==sha(HERE/name)
 assert len(d['scene']['buttons'])==13 and d['scene']['buttons'][6]['name']=='Button4' and d['scene']['launcher']['local_position']==[0.0,5.420000076293945,15.0]
 assert d['base_mesh']['vertex_count']==22 and d['base_mesh']['index_count']==60 and len(d['base_mesh']['indices'])==60 and len(d['base_mesh']['uv_f32_bits'])==22
 assert d['sync_line']['width_factor']==0.2800000011920929 and d['sync_line']['projection']['pixels_per_world_unit']==360.0
 assert d['runtime_corroboration']=={'geometry_events':87037,'mesh_owners':510,'line_owners':80,'line_endpoint_writes':24470,'line_width_writes':12235,'projected_outside_count':0}
 assert d['authorization']=={'ordinary_fixed_1600x720_note_motion':True,'ordinary_base_note_mesh_producer':True,'ordinary_sync_line_producer':True,'advanced_mesh':False,'multiple_directional_back_line':False,'habahiro_exact':False,'threshold_shader':False}
 print('verified current ordinary Note geometry producer profile: methods=17 mesh=22/60 line=24470/12235')
if __name__=='__main__':main()
