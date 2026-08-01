#!/usr/bin/env python3
"""Build one current-version implementation profile for ordinary Note motion, base mesh and sync line producers."""
from __future__ import annotations
import hashlib,json,zipfile
from pathlib import Path
import UnityPy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
APK=ROOT/'samples/jp.co.craftegg.band'/'10.1.4_230'/'original'/'base.apk'
STATIC=HERE/'resource_pixi_rendering_static_contract.json'
MIGRATION=HERE/'resource_pixi_rendering_instruction_migration.json'
GEOMETRY=HERE/'resource_pixi_rendering_geometry_oracle.json'
LINE=HERE/'resource_pixi_rendering_line_profile.json'
PROJECTION=HERE/'resource_pixi_rendering_projection_profile.json'
OUT=HERE/'resource_pixi_rendering_note_geometry_profile.json'
METHODS=(
 ('NoteBase','Move'),('NoteBase','calcNoteScale'),('NoteBase','getStartPos'),
 ('NoteMesh','Activate'),('NoteMesh','OnUpdate'),('NoteMesh','GetMeshWidthRate'),
 ('NoteMesh','calcurateAfterNoteVirtualScale'),('NoteMesh','getAfterNoteScale'),
 ('NoteSyncLine','Setup'),('NoteSyncLine','setLineRendererPosition'),
 ('NoteSyncLine','setLineWidth'),('NoteSyncLine','OnUpdate'),('NoteSyncLine','getEdgeMargin'),
 ('ButtonManager','execMultiResolution'),('ButtonManager','initButtonScale'),
 ('ButtonManager','setupGameButtonPosition'),('ButtonManager','setupLauncherPosition'),
)
BUTTON_TRANSFORMS=(583,588,526,505,550,489,488,467,445,438,440,553,522)
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def go_name(by,path_id):
 tree=by[path_id].read_typetree();return by[tree['m_GameObject']['m_PathID']].read_typetree()['m_Name']
def main():
 static=load(STATIC);migration=load(MIGRATION);geometry=load(GEOMETRY);line=load(LINE);projection=load(PROJECTION)
 smap={(r['owner'],r['method']):r for r in static['methods']}; mmap={(r['owner'],r['method']):r for r in migration['methods']}
 methods=[]
 for key in METHODS:
  s=smap[key];m=mmap[key]
  allowed_status='changed-semantic-instruction-shape' if key==('NoteMesh','GetMeshWidthRate') else 'normalized-instruction-equivalent'
  assert s['status']=='mapped' and m['status']==allowed_status and m['target_sha256']==s['target_sha256']
  methods.append({'owner':key[0],'method':key[1],'rva':s['target_rva'],'end_rva':s['target_end_rva'],'arm64_sha256':s['target_sha256'],'arm64_evidence':s['evidence'],'instruction_status':m['status'],'current_specific_differences':m['differences']})
 with zipfile.ZipFile(APK) as archive: level=archive.read('assets/bin/Data/level3')
 scene=UnityPy.load(level);by={o.path_id:o for o in scene.objects}
 launcher=by[470].read_typetree();assert go_name(by,470)=='Launcher'
 button_rows=[]
 for path_id in BUTTON_TRANSFORMS:
  t=by[path_id].read_typetree();p=t['m_LocalPosition'];button_rows.append({'name':go_name(by,path_id),'transform_path_id':path_id,'local_position':[p['x'],p['y'],p['z']]})
 expected=['Button1','Button1_5','Button2','Button2_5','Button3','Button3_5','Button4','Button4_5','Button5','Button5_5','Button6','Button6_5','Button7']
 assert [r['name'] for r in button_rows]==expected
 assert geometry['mesh']['runtime_vertex_count']==22 and geometry['line']['start_end_width_equal'] is True
 init=geometry['mesh']['init_payloads']
 doc={
  'schema_version':1,'status':'confirmed-current-ordinary-note-geometry-producer-profile',
  'sample':projection['sample'],
  'source':{'base_apk_sha256':sha(APK),'level3_sha256':hashlib.sha256(level).hexdigest().upper(),'static_contract_sha256':sha(STATIC),'instruction_migration_sha256':sha(MIGRATION),'geometry_oracle_sha256':sha(GEOMETRY),'line_profile_sha256':sha(LINE),'projection_profile_sha256':sha(PROJECTION)},
  'methods':methods,
  'scene':{'launcher':{'name':'Launcher','transform_path_id':470,'local_position':[launcher['m_LocalPosition']['x'],launcher['m_LocalPosition']['y'],launcher['m_LocalPosition']['z']]},'buttons':button_rows,'authored_button_spacing_x':2.200000047683716,'authored_goal_y':-3.450000047683716,'launch_distance_rate':0.05000000074505806,'vanishing_slope':-1.3439395427703857,'reference_screen_size_x':9.578571319580078,'scale_min_ratio_list':[0.98,0.988,0.9898,0.9899,0.991,0.9915,0.9917]},
  'note_motion':{'arrival_seconds':0.800000011920929,'progress':'progress == 0 ? realMoveSecond / arrivalSeconds : progress + deltaTime / arrivalSeconds','curve':'pow(1.1, (progress - 1) * 50)','position_x':'startX + curve * (goalX - startX)','position_y':'startY - abs((startY - goalY) * curve)','button_x':'authoredButtonX * screenWidthAdjustRate','button_y':'authoredButtonY * screenWidthAdjustRate','note_start_x':'buttonX * launchDistanceRate','vanishing_y':'button1Y + button1X * vanishingSlope','note_start_y':'buttonY + (1 - launchDistanceRate) * (vanishingY - buttonY)','screen_width_adjust_rate':'screenSizeX / referenceScreenSizeX','note_setting_scale':'screenWidthAdjustRate * effectiveNoteSize / 100','effective_note_size':'multi-range ? clamp(NoteSize, 80, 150) : NoteSize','uniform_scale':'verticalRate * aspectRatio + (1 - aspectRatio)','vertical_rate':'noteSettingScale * abs(launcherY - currentY) / abs(launcherY - targetCenterY)','aspect_ratio':'clamp(highAspectRatio,0,1) * (scaleMinRatio[buttonCount-1] - 0.996) + 0.996','float_policy':'Float32 after every managed arithmetic write; no implicit clamp except named clamps'},
  'base_mesh':{'vertex_count':22,'index_count':60,'pair_count':11,'front_boundary':'position.x +/- localScaleX * buttonCount * screenToSafeAreaRatio * widthRate','after_boundary':'position.x +/- afterScaleX * buttonCount * screenToSafeAreaRatio * widthRate','vertices':'for section i=0..10, linear interpolate front/after boundaries at i/10; Z=0','indices':init['RPS-004']['index_i32'],'uv_f32_bits':init['RPS-002']['uv_f32_bits'],'initial_color_f32_bits':init['RPS-003']['color_f32_bits'],'width_rate':'special disabled=>1; type2=>1.05; type3..7=>1.05+clamp(progress,0,1)*0.03; otherwise 1','threshold_property_id':3453,'observed_threshold_f32_bits':geometry['mesh']['material_threshold_f32_bits']},
  'sync_line':{'setup_order':['clear previous target references','bind target A/B','mark both IsSyncNote','store edgeMargin','set endpoints','set zero width','set threshold','refresh endpoints'],'position':'target world positions; when edgeMargin>0 move each X inward by getEdgeMargin(target)*lossyScaleX','margin_exclusion':'GameNoteType 10..19 returns zero margin','update':'both Move => endpoint refresh, enable, width=targetA.localScaleX*0.28; either non-Move => hide; either Deactive => Deactivate','width_factor':0.2800000011920929,'sorting_order':69,'projection':projection['mapping'],'portable_quad':line['portable_mapping']},
  'runtime_corroboration':{'geometry_events':geometry['coverage']['events'],'mesh_owners':geometry['coverage']['mesh_lifecycle_owners'],'line_owners':geometry['coverage']['line_owners'],'line_endpoint_writes':line['runtime_r2']['endpoint_writes'],'line_width_writes':line['runtime_r2']['width_writes'],'projected_outside_count':projection['r2_validation']['outside_view_or_clip_count']},
  'authorization':{'ordinary_fixed_1600x720_note_motion':True,'ordinary_base_note_mesh_producer':True,'ordinary_sync_line_producer':True,'advanced_mesh':False,'multiple_directional_back_line':False,'habahiro_exact':False,'threshold_shader':False},
  'limits':['profile is ordinary fixed 1600x720 only','advanced 42-vertex mesh and multiple-directional back line are not authorized by this profile','threshold value transport is confirmed but Pixi shader clipping remains separate','HABAHIRO exact geometry is not implied'],
  'unknown_fields':[]}
 OUT.write_text(json.dumps(doc,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
 print('built current ordinary Note geometry producer profile')
if __name__=='__main__':main()
