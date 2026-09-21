"""Adapt delivered form prefab graphs for the shared original UI renderer."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--reverse-root', type=Path, required=True)
parser.add_argument('--reverse-commit', required=True)
args = parser.parse_args()
base = 'artifacts/investigations/editor-form-controls-10-1-4/'
result = {'reverseCommit': args.reverse_commit, 'sources': {}, 'prefabs': {}}
def read(name):
    raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + base + name], cwd=args.reverse_root)
    result['sources'][name] = hashlib.sha256(raw).hexdigest().upper()
    return json.loads(raw)

for name in ['takeoversettingdialog', 'difficultybutton']:
    graph = read('resources/' + name + '.json')
    objects = graph['objects']
    gos = {o['pathId']: o['tree'] for o in objects if o['class'] == 'GameObject'}
    transforms = {o['pathId']: o['tree'] for o in objects if o['class'] == 'Transform'}
    nodes = {}
    for tid, t in transforms.items():
        gid, parent = t['m_GameObject']['m_PathID'], t['m_Father']['m_PathID']
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
        data = {k: v for k, v in o['tree'].items() if k not in ('m_Script', 'm_Name')}
        gid = data.pop('m_GameObject', {}).get('m_PathID')
        if gid in nodes:
            components.append({'id': o['pathId'], 'node': gid, 'kind': o['class'], 'data': data})
    # Only the referenced input subtree and label are consumed, not the account dialog.
    if name == 'takeoversettingdialog':
        wanted = {101, 114, 125, 134}
        components = [c for c in components if c['id'] in wanted]
        keep = {c['node'] for c in components}
        for gid in list(keep):
            while gid != 27:
                gid = nodes[gid]['parent']
                keep.add(gid)
        nodes = {gid: n for gid, n in nodes.items() if gid in keep}
        nodes[27] = {**nodes[27], 'parent': None, 'position': {'x': 0, 'y': 0, 'z': 0}}
    result['prefabs'][name] = {'resource': graph['resource'], 'nodes': list(nodes.values()), 'components': components}
result['difficulty'] = read('difficulty-component.json')
target = Path(__file__).resolve().parents[1] / 'src/data/originalFormProfile.json'
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print('Adapted two source form components')
