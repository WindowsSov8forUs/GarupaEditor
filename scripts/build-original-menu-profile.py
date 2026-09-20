"""Adapt committed original UI graphs without changing their authored layout."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from original_wording import value_of

parser = argparse.ArgumentParser()
parser.add_argument('--reverse-root', type=Path, required=True)
parser.add_argument('--reverse-commit', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
old = args.reverse_root / 'artifacts/investigations/menu-settings-ui-10-1-4'
extra = args.reverse_root / 'artifacts/investigations/menu-settings-ui-completion-10-1-4'
names = ['menulistdialog', 'largemenulistcell', 'smallmenulistcell',
         'rhythmgamesettingdialog', 'livesettingstabpage', 'liveeffectvolumetabpage',
         'liveskintabpage', 'systemtabpage', 'staruiradiobutton', 'staruisquareradiobutton',
         'confirmcommondialog', 'selectablecommondialog', 'optionpagecaption', 'tutorialslidewindow']
calibration_names = ['rhythmadjustdialog', 'rhythmadjustreadydialog', 'rhythmadjustdonedialog']
result = {'reverseCommit': args.reverse_commit, 'sources': {}, 'prefabs': {}, 'wording': {}}
layout_names = ['ingamesettingnoteskin', 'ingamesettingdirectionalflickskin', 'previewnote', 'previewnotemesh']
for name in names + calibration_names + ['header', 'skinpreview', 'specialskinrow'] + layout_names:
    folder = extra / 'rhythm-adjust' if name in calibration_names else old if name in names else extra / 'skin-preview-layout' if name in layout_names else extra
    path = folder / 'resources' / (name + '.json')
    data = path.read_bytes()
    graph = json.loads(data)
    result['sources'][name] = {'path': path.relative_to(args.reverse_root).as_posix(),
                               'sha256': hashlib.sha256(data).hexdigest().upper()}
    objects = graph['objects']
    gos = {o['pathId']: o['tree'] for o in objects if o['class'] == 'GameObject'}
    transforms = {o['pathId']: o['tree'] for o in objects if o['class'] == 'Transform'}
    nodes = {}
    for tid, t in transforms.items():
        gid = t['m_GameObject']['m_PathID']
        parent = t['m_Father']['m_PathID']
        nodes[gid] = {'id': gid, 'transformId': tid, 'name': gos[gid]['m_Name'],
                      'parent': transforms[parent]['m_GameObject']['m_PathID'] if parent else None,
                      'position': t['m_LocalPosition'], 'scale': t['m_LocalScale'],
                      'rotation': t['m_LocalRotation'], 'active': bool(gos[gid]['m_IsActive'])}
    def node_path(gid):
        n = nodes[gid]
        return (node_path(n['parent']) + '/' if n['parent'] is not None else '') + n['name']
    for gid in nodes:
        nodes[gid]['path'] = node_path(gid)
    components = []
    for o in objects:
        if o['class'] in ('GameObject', 'Transform'):
            continue
        t = {k: v for k, v in o['tree'].items() if k not in ('m_Script', 'm_Name')}
        gid = t.pop('m_GameObject', {}).get('m_PathID')
        if gid in nodes:
            components.append({'id': o['pathId'], 'node': gid, 'kind': o['class'], 'data': t})
    result['prefabs'][name] = {'resource': graph['resource'], 'nodes': list(nodes.values()),
                               'components': components}
wording = json.loads((extra / 'wording-selected.json').read_text(encoding='utf-8'))
result['wording'] = {row['key']: value_of(row) for row in wording['records']}
preview_words = extra / 'preview-behavior/wording-selected.json'
for row in json.loads(preview_words.read_text(encoding='utf-8'))['records']:
    result['wording'][row['key']] = value_of(row)
result['sources']['preview-wording'] = {
    'path': preview_words.relative_to(args.reverse_root).as_posix(),
    'sha256': hashlib.sha256(preview_words.read_bytes()).hexdigest().upper()}
behavior_path = extra / 'preview-behavior/semantics.json'
behavior = json.loads(behavior_path.read_text(encoding='utf-8'))
current_behavior = json.loads((root / 'src/data/originalSkinPreviewBehavior.json').read_text(encoding='utf-8'))
for key in ('initialScale', 'rendering'):
    if key in current_behavior: behavior[key] = current_behavior[key]
behavior['reverseCommit'] = args.reverse_commit
behavior['sourceSha256'] = hashlib.sha256(behavior_path.read_bytes()).hexdigest().upper()
(root / 'src/data/originalSkinPreviewBehavior.json').write_text(
    json.dumps(behavior, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
result['sources']['wording'] = {'path': (extra / 'wording-selected.json').relative_to(args.reverse_root).as_posix(),
                               'sha256': hashlib.sha256((extra / 'wording-selected.json').read_bytes()).hexdigest().upper()}
menu_words_path = extra / 'menu-content/wording-selected.json'
menu_words = subprocess.check_output(['git', 'show', f'{args.reverse_commit}:{menu_words_path.relative_to(args.reverse_root).as_posix()}'], cwd=args.reverse_root)
for row in json.loads(menu_words)['records']:
    result['wording'][row['key']] = row['text']
result['sources']['menu-content-wording'] = {'path': menu_words_path.relative_to(args.reverse_root).as_posix(),
    'sha256': hashlib.sha256(menu_words).hexdigest().upper()}
guide_path = extra / 'settings-guides/profile.json'
guide_bytes = subprocess.check_output(['git', 'show', f'{args.reverse_commit}:{guide_path.relative_to(args.reverse_root).as_posix()}'], cwd=args.reverse_root)
guide = json.loads(guide_bytes)
result['wording'].update(guide['wording'])
result['sources']['settings-guides'] = {'path': guide_path.relative_to(args.reverse_root).as_posix(),
    'sha256': hashlib.sha256(guide_bytes).hexdigest().upper()}
calibration_words = extra / 'rhythm-adjust/wording.json'
result['wording'].update(json.loads(calibration_words.read_text(encoding='utf-8'))['wording'])
output = root / 'src/data/originalMenuProfile.json'
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
atlas_path = root / 'src/data/menuUiAtlas.json'
atlas = json.loads(atlas_path.read_text(encoding='utf-8'))
original = next(row for row in json.loads((old / 'resources/atlases.json').read_text(encoding='utf-8'))
                if row['pathId'] == 1796)
atlas['atlasRows'] = [{'exactKey': s['name'], **{k: v for k, v in s.items() if k != 'name'}}
                      for s in original['tree']['mSprites']]
atlas_path.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Original UI: {len(result["prefabs"])} prefab graphs, {len(result["wording"])} resolved wording keys')

template_path = extra / "controls-preview/semantics.json"
template_data = json.loads(template_path.read_text(encoding="utf-8"))
template_data["reverseCommit"] = args.reverse_commit
template_data["sourceSha256"] = hashlib.sha256(template_path.read_bytes()).hexdigest().upper()
(root / "src/data/originalButtonTemplates.json").write_text(json.dumps(template_data, indent=2) + "\n", encoding="utf-8")

selection_path = extra / 'skin-preview-layout/selection-labels.json'
selection = json.loads(selection_path.read_text(encoding='utf-8'))
selection['reverseCommit'] = args.reverse_commit
selection['sourceSha256'] = hashlib.sha256(selection_path.read_bytes()).hexdigest().upper()
(root / 'src/data/originalSkinSelection.json').write_text(json.dumps(selection, indent=2) + '\n', encoding='utf-8')

runtime_path = extra / 'controls-preview/runtime-layout-constants.json'
runtime = json.loads(runtime_path.read_text(encoding='utf-8'))
runtime['reverseCommit'] = args.reverse_commit
runtime['sourceSha256'] = hashlib.sha256(runtime_path.read_bytes()).hexdigest().upper()
(root / 'src/data/originalSettingsRuntime.json').write_text(
    json.dumps(runtime, indent=2) + '\n', encoding='utf-8')

# These supplements use canonical Git bytes, independent of checkout newline settings.
for relative, filename in [
    ("controls-preview/radio-layout.json", "originalSettingsRadioLayout.json"),
    ("preview-particles/profile.json", "originalSkinPreviewParticles.json"),
    ("ui-drawing/profile.json", "originalUiDrawing.json"),
    ("menu-content/profile.json", "originalMenuContent.json"),
    ("settings-guides/profile.json", "originalSettingsGuides.json"),
    ("sudden-rendering/profile.json", "simulator/originalSuddenProfile.json"),
]:
    source_path = (extra / relative).relative_to(args.reverse_root).as_posix()
    data = subprocess.check_output(["git", "show", f"{args.reverse_commit}:{source_path}"], cwd=args.reverse_root)
    profile = json.loads(data)
    profile["reverseCommit"] = args.reverse_commit
    profile["sourceSha256"] = hashlib.sha256(data).hexdigest().upper()
    (root / "src/data" / filename).write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

calibration = json.loads((extra / 'rhythm-adjust/semantics.json').read_text(encoding='utf-8'))
calibration['reverseCommit'] = args.reverse_commit
particle_config = json.loads((extra / 'rhythm-adjust/particles.json').read_text(encoding='utf-8'))
for config in particle_config.values():
    for system in config['systems']:
        system['particle'] = {k:v for k,v in system['particle'].items() if not k.endswith('Module') or v.get('enabled')}
calibration['particles'] = particle_config
import struct
f32 = lambda x: struct.unpack('<f', struct.pack('<I', x))[0]
dependencies = json.loads((extra / 'rhythm-adjust/resources/dependencies.json').read_text(encoding='utf-8'))
clip = next(row['tree'] for row in dependencies if row['class'] == 'AnimationClip')
raw = clip['m_MuscleClip']['m_Clip']['data']['m_StreamedClip']['data']
curves = [[], [], []]; i = 0
while i < len(raw):
    time, count = f32(raw[i]), raw[i+1]; i += 2
    for _ in range(count):
        index = raw[i]; coefficients = [f32(x) for x in raw[i+1:i+5]]; i += 5
        if time >= 0 and time < 1e20: curves[index].append({'time': time, 'coefficients': coefficients})
calibration['resultAnimation'] = {'durationSeconds': 1, 'loop': False,
    'curves': [{'index': i, 'channel': 'scale.' + 'xyz'[i], 'storage': 'streamed', 'keys': keys} for i, keys in enumerate(curves)]}
(root / 'src/data/originalRhythmAdjust.json').write_text(json.dumps(calibration, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8', newline='\n')
