# One-off helper: apply review decisions to accessories.json (same formatting as sync-wiki).
import json, sys
P = 'src/lib/data/accessories.json'
def load(): return json.load(open(P))
def save(entries):
    lines = []
    for e in entries:
        d = json.dumps(e, separators=(', ', ': '), ensure_ascii=False)
        lines.append('\t{ ' + d[1:-1] + ' }')
    open(P, 'w').write('[\n' + ',\n'.join(lines) + '\n]\n')
def apply(fixes):
    entries = load()
    byname = {e['name']: e for e in entries}
    for name, changes in fixes.items():
        e = byname[name]
        e.update(changes)
        e.pop('reviewed', None)
    save(entries)
    print('applied', len(fixes))
if __name__ == '__main__':
    apply(json.load(sys.stdin))
