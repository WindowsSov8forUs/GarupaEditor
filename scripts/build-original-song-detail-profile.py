"""Select source widgets for the editor song page; preserve authored node transforms."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--reverse-root', type=Path, required=True)
parser.add_argument('--reverse-commit', required=True)
args = parser.parse_args()
base = 'artifacts/investigations/'
result = {'reverseCommit': args.reverse_commit, 'sources': {}, 'prefabs': {}}

def select(name, path, ids, node_ids=(), serialized_file=None):
    raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + base + path], cwd=args.reverse_root)
    graph = json.loads(raw)
    if serialized_file:
        graph = {'resource': serialized_file, 'objects': [
            {'pathId': o['pathId'], 'class': o['type'], 'tree': o['value']}
            for o in graph['files'][serialized_file]['objects']]}
    result['sources'][name] = {'path': base + path, 'sha256': hashlib.sha256(raw).hexdigest().upper()}
    gos = {o['pathId']: o['tree'] for o in graph['objects'] if o['class'] == 'GameObject'}
    transforms = {o['pathId']: o['tree'] for o in graph['objects'] if o['class'] == 'Transform'}
    nodes = {}
    for tid, t in transforms.items():
        gid, parent = t['m_GameObject']['m_PathID'], t['m_Father']['m_PathID']
        nodes[gid] = {'id': gid, 'transformId': tid, 'name': gos[gid]['m_Name'],
                      'parent': transforms[parent]['m_GameObject']['m_PathID'] if parent else None,
                      'position': t['m_LocalPosition'], 'scale': t['m_LocalScale'],
                      'rotation': t['m_LocalRotation'], 'active': bool(gos[gid]['m_IsActive'])}
    def path_of(gid):
        n = nodes[gid]
        return (path_of(n['parent']) + '/' if n['parent'] is not None else '') + n['name']
    for gid in nodes:
        nodes[gid]['path'] = path_of(gid)
    components = []
    keep = set()
    for o in graph['objects']:
        if o['pathId'] not in ids:
            continue
        data = {k: v for k, v in o['tree'].items() if k not in ('m_Script', 'm_Name', 'm_GameObject')}
        gid = o['tree']['m_GameObject']['m_PathID']
        components.append({'id': o['pathId'], 'node': gid, 'kind': o['class'], 'data': data})
        while gid is not None:
            keep.add(gid)
            gid = nodes[gid]['parent']
    assert len(components) == len(ids), name
    for gid in node_ids:
        while gid is not None:
            keep.add(gid)
            gid = nodes[gid]['parent']
    result['prefabs'][name] = {'resource': graph['resource'], 'nodes': [n for gid, n in nodes.items() if gid in keep], 'components': components}

select('jacket', 'song-select-filter-components-10-1-4/resources/musicselect.json', [241, 264, 270, 279, 293, 310, 312, 313, 314, 369, 373])
select('difficultyBase', 'song-select-filter-components-10-1-4/resources/musicselect.json', [257, 258, 274, 277, 294, 296, 302, 307, 311], [6])
select('difficultyManager', 'editor-form-controls-10-1-4/resources/difficultymanager.json', [15, 16], [5, 6, 7, 2, 3])
select('profileStatsRow', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofileclearedmusiccountview.json', [82, 94, 95])
select('profileStatsMounts', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [], [191, 238, 165])
select('profilePageMask', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [745])
select('profilePager', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [631, 640, 650, 690, 691, 718, 720, 729, 742, 866, 874])
select('profileMvHeader', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [644, 839, 848, 849, 954, 957, 964])
select('profileNoteStatistics', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [645, 646, 758, 765, 768, 778, 810, 875, 878, 919, 943, 947, 948, 960, 961, 962, 967], [263, 105, 181])
select('profileNoteCountIcon', 'profile-pagination-10-1-4/character-rank-icon.json', [10, 11, 12])
select('profileStageChallengeIcon', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [770])
select('profileLeftBase', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [932])
select('profileInformation', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [657, 662, 676, 680, 681, 696, 706, 708, 725, 731, 743, 753, 754, 859], [95, 98, 47])
select('profileSettingsButton', 'info-pages-10-1-4/profile-resources/prefabs__menu__userprofile__userprofilecontroller.json', [639, 653, 663, 686, 739, 746])
select('profileSettingsDialog', 'profile-settings-cn-9-4-4/publishconfigdialog.json', [184, 187, 199, 208, 209, 223, 225, 254, 258, 259, 267, 279, 287, 288, 295])
select('difficultyLabel', 'simulator-result-detail-10-1-4/serialized.json', [10, 11], serialized_file='1d0d926096e78407db4e9684b2a23201')
select('profileThumbnail', 'info-pages-10-1-4/profile-thumbnail/cardthumbnail.json', [126])
select('profileRank', 'profile-rank-cn-9-4-4/rank-button.json', [658, 775, 780, 834, 835, 846, 879])
select('profileDegreeSlot', 'profile-rank-cn-9-4-4/degree-image-slot.json', [21])
select('songFeatureIcons', 'info-pages-10-1-4/resources/prefabs__menu__common__deckselectmusicinfo.json', [55, 90])
thumbnail_path = base + 'info-pages-10-1-4/profile-thumbnail/native.json'
thumbnail_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + thumbnail_path], cwd=args.reverse_root)
result['sources']['profileThumbnailSize'] = {'path': thumbnail_path, 'sha256': hashlib.sha256(thumbnail_raw).hexdigest().upper()}
result['profileThumbnailScale'] = json.loads(thumbnail_raw)['scale']

pagination_path = base + 'profile-pagination-10-1-4/contract.json'
pagination_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + pagination_path], cwd=args.reverse_root)
result['sources']['profilePagination'] = {'path': pagination_path, 'sha256': hashlib.sha256(pagination_raw).hexdigest().upper()}
pagination = json.loads(pagination_raw)
result['profilePagination'] = {key: pagination[key] for key in (
    'pageWidth', 'durationSeconds', 'initialIndex', 'initialRootX', 'activeIcon', 'inactiveIcon', 'iconCellWidth')}

wording_path = base + 'cn-master-wording-9-4-4/master_wording_collection.json'
wording_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + wording_path], cwd=args.reverse_root)
result['sources']['wording'] = {'path': wording_path, 'sha256': hashlib.sha256(wording_raw).hexdigest().upper()}
result['wording'] = {key: json.loads(wording_raw)[key] for key in ['word_musicLevel', 'myProfile_contentCaption_rank', 'word_setting']}

target = Path(__file__).resolve().parents[1] / 'src/data/originalSongDetailProfile.json'
def select_subtrees(name, path, roots):
    graph = json.loads(subprocess.check_output(['git', 'show', args.reverse_commit + ':' + base + path], cwd=args.reverse_root))
    transforms = {o['pathId']: o['tree'] for o in graph['objects'] if o['class'] == 'Transform'}
    parents = {t['m_GameObject']['m_PathID']: transforms[t['m_Father']['m_PathID']]['m_GameObject']['m_PathID']
               if t['m_Father']['m_PathID'] else None for t in transforms.values()}
    def included(node):
        return node in roots or (parents.get(node) is not None and included(parents[node]))
    ids = [o['pathId'] for o in graph['objects'] if o['class'] not in ('GameObject', 'Transform')
           and included(o['tree'].get('m_GameObject', {}).get('m_PathID'))]
    # Empty placement transforms are runtime consumers too (radio start positions,
    # nested view mounts). Preserve them along with the drawable components.
    select(name, path, ids, [node for node in parents if included(node)])

select_subtrees('livePreparation', 'info-pages-10-1-4/resources/prefabs__screen__sololivedeckselect.json', [3, 6, 13, 18, 26, 86, 89, 67])
select_subtrees('demoPlayDialog', 'live-preparation-10-1-4/demoplaymodeselectdialog.json', [16])
select_subtrees('preparationMv', 'live-preparation-10-1-4/deckselectmvselectormvview.json', [4])
select_subtrees('preparationMvOff', 'live-preparation-10-1-4/deckselectmvselectordisableview.json', [5])
spot_path = base + 'live-preparation-10-1-4/spot-atlas.json'
spot_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + spot_path], cwd=args.reverse_root)
result['sources']['spotAtlas'] = {'path': spot_path, 'sha256': hashlib.sha256(spot_raw).hexdigest().upper()}
result['spotAtlas'] = json.loads(spot_raw)
for component in result['prefabs']['livePreparation']['components']:
    if component['data'].get('mAtlas') == {'m_FileID': 4, 'm_PathID': 1}:
        component['data']['sourceAtlas'] = 'spot'
spot_png = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + base + 'live-preparation-10-1-4/spot-atlas.png'], cwd=args.reverse_root)
assert hashlib.sha256(spot_png).hexdigest().upper() == result['spotAtlas']['pngSha256']
(target.parents[1] / 'assets/game/atlas/menu/spot-atlas.png').write_bytes(spot_png)
live_contract_path = base + 'live-preparation-10-1-4/contract.json'
live_contract_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + live_contract_path], cwd=args.reverse_root)
result['sources']['livePreparationContract'] = {'path': live_contract_path, 'sha256': hashlib.sha256(live_contract_raw).hexdigest().upper()}
result['livePreparation'] = json.loads(live_contract_raw)
runtime_path = base + 'live-preparation-device-10-2-0/runtime.json'
runtime_raw = subprocess.check_output(['git', 'show', args.reverse_commit + ':' + runtime_path], cwd=args.reverse_root)
result['sources']['livePreparationRuntime'] = {'path': runtime_path, 'sha256': hashlib.sha256(runtime_raw).hexdigest().upper()}
switch = next(row for row in json.loads(runtime_raw)['targets'] if row['spriteName'] == 'icon_switch')
assert not switch['resolvedSprite'] and not switch['hasDrawCall']
assert not switch['atlas']['hasSwitch'] and switch['atlas']['replacement'] is None
words = json.loads(wording_raw)
result['wording'].update({key: words[key] for key in (
    'word_liveStart', 'button_practiceLive_start', 'button_screen_soloLiveDeckSelect_live',
    'button_screen_soloLiveDeckSelect_practice', 'dialog_demoPlaySelect_title', 'dialog_demoPlaySelect_message',
    'dialog_demoPlaySelect_caution', 'word_demoPlay', 'balloon_demoPlayOn_text', 'button_demoPlaySetting_text',
    'word_autoLive', 'word_on', 'word_off', 'header_mainTitle_freeLive',
    'header_mainTitle_freeLivePracticeMode')})

target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f"Selected {len(result['prefabs'])} component groups from source panels")
