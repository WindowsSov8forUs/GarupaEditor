#!/usr/bin/env python3
from __future__ import annotations
import gzip,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_hud_visible_profile.json';T=H/'runtime/ordinary-rendering-hud-r3.trace.json.gz'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));t=json.loads(gzip.decompress(T.read_bytes()));assert d['status']=='confirmed-current-ordinary-visible-hud-mask-animation-portable-profile';assert d['source']['trace_sha256']==sha(T) and d['source']['trace_bytes']==T.stat().st_size;assert d['coverage']['events']==len(t['events'])==19888
 assert d['bitmap_hud']['combo']['digit_keys']==[f'icon_number_big_{i}' for i in range(10)];assert (d['bitmap_hud']['combo']['widget_width'],d['bitmap_hud']['combo']['widget_height'],d['bitmap_hud']['combo']['depth'])==(82,116,5)
 assert d['animations']['combo_number']['runtime_restart_count']==631 and d['animations']['game_judge']['runtime_restart_count']==631
 a=d['authorization'];assert all(a[k] for k in ('bitmap_combo_score_life','bitmap_skill_score_up','ordinary_field_sudden_mask','combo_animation_sampling','game_judge_animation_restart','life_heal_animation_sampling','score_skill_visible_overlay'))
 assert all(not a[k] for k in ('damage_guard_animation','never_die_animation','judge_skill_animation','flick_icon_animation','multiple_directional_visual'));assert d['unknown_fields']==[]
 print('verified visible HUD profile:',d['coverage']['events'],'events')
if __name__=='__main__':main()
