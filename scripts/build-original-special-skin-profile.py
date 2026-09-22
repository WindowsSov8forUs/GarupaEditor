"""Adapt delivered special skin selection prefab graphs for the shared original UI renderer."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--reverse-root', type=Path, required=True)
parser.add_argument('--reverse-commit', required=True)
args = parser.parse_args()
base = 'artifacts/investigations/menu-settings-ui-10-1-4/'
result = {'reverseCommit': args.reverse_commit, 'sources': {}, 'prefabs': {}}
def read(name):
    raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + base + name], cwd=args.reverse_root)
    result['sources'][name] = hashlib.sha256(raw).hexdigest().upper()
    return json.loads(raw)

for name in ['limitedskinselectdialog', 'limitedskinselectitemcell', 'specialskindetailsettingdialog']:
    mainland = name in ['limitedskinselectitemcell', 'specialskindetailsettingdialog']
    base = ('artifacts/investigations/cn-font-localization-9-4-4/' if mainland
            else 'artifacts/investigations/menu-settings-ui-10-1-4/')
    graph = read(('' if mainland else 'resources/') + name + '.json')
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
    result['prefabs'][name] = {'resource': graph['resource'], 'nodes': list(nodes.values()), 'components': components}
    if 'sample' in graph:
        result['prefabs'][name]['sample'] = graph['sample']
base = 'artifacts/investigations/simulator-skin-settings-complete-contract-10-1-4/'
master = read('skin_master_catalog.json')
result['limited'] = [{k: v['row'][k] for k in ['limitedSkinId', 'seq', 'limitedSkinName', 'thumbnailFileName']} for v in master['limited']]
base = 'artifacts/investigations/menu-settings-ui-completion-10-1-4/'
result['consumers'] = read('special-skin-consumers.json')['facts']
result['collaboration'] = [{k: row[k] for k in ['seasonSpecialId', 'description']}
                           for row in read('special-skin-season-descriptions.json')['rows']]
localized = read('special-skin-localized-names.json')['servers']
result['selectionFlow'] = read('special-skin-selection-flow.json')['facts']
result['listLayout'] = read('special-skin-list-layout.json')['facts']
result['thumbnail'] = read('limited-thumbnail/native.json')['facts']
thumbnail = read('limited-thumbnail/limitedliveskinthumbnail.json')['objects']
result['thumbnail']['loadingTween'] = next(o['tree'] for o in thumbnail if o['class'] == 'TweenRotation')
result['thumbnail']['loadingSprite'] = next(o['tree'] for o in thumbnail
    if o['class'] == 'UISprite' and o['tree']['mSpriteName'] == 'point_loading')
rainbow = next(row for row in localized['cn']['collaboration'] if row['seasonSpecialId'] == 100001)
result['collaboration'].append({'seasonSpecialId': rainbow['seasonSpecialId'],
                                'description': rainbow['seasonDescription']})
for row in result['limited']:
    row['server'] = 'jp'
    jp = next(value for value in localized['jp']['limited'] if value['id'] == row['limitedSkinId'])
    cn = next((value for value in localized['cn']['limited']
               if value['id'] == jp['id'] and value['bundles'] == jp['bundles']
               and value['thumbnailFileName'] == jp['thumbnailFileName']), None)
    row['limitedSkinNameCn'] = cn['name'] if cn else None
    row['description'] = (cn or jp)['description']
for row in localized['cn']['limited']:
    if any(value['limitedSkinId'] == row['id'] for value in result['limited']):
        continue
    result['limited'].append({'limitedSkinId': row['id'], 'seq': row['seq'],
                              'limitedSkinName': row['name'], 'limitedSkinNameCn': row['name'],
                              'description': row['description'],
                              'thumbnailFileName': row['thumbnailFileName'], 'server': 'cn'})

for row in result['collaboration']:
    jp = next((v for v in localized['jp']['collaboration'] if v['seasonSpecialId'] == row['seasonSpecialId']), None)
    cn = next((v for v in localized['cn']['collaboration'] if v['seasonSpecialId'] == row['seasonSpecialId']
               and (jp is None or v['bundles'] == jp['bundles'])), None)
    if cn is None and jp is not None:
        cn = next((v for v in localized['cn']['collaboration'] if v['bundles'] == jp['bundles']), None)
    row['skinDescription'] = (cn or jp)['description']
    row['skinDescriptionCn'] = cn['description'] if cn else None
# Reuse only the applicable generic clauses from the delivered mainland master;
# exclude the event deadline and the skin-specific directional restriction.
generic_cn = next(v for v in localized['cn']['collaboration'] if v['seasonSpecialId'] == 263)['description'].splitlines()
result['collaborationGenericDescriptionCn'] = '\n'.join(next(line for line in generic_cn if text in line)
    for text in ['开启期间限定皮肤效果', '能够在个别设置'])
base = 'artifacts/investigations/cn-master-wording-9-4-4/'
result['wording'] = {k: v for k, v in read('master_wording_collection.json').items()
                     if 'specialSkinDetailSetting' in k or k in ['word_off_skin_description',
                         'dialog_limitedSkinDetailSetting_title', 'dialog_button_ok', 'word_past_limited_skin_title']}

target = Path(__file__).resolve().parents[1] / 'src/data/originalSpecialSkinProfile.json'
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print('Adapted special skin dialogs and source catalog')
