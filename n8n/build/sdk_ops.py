"""update_workflow operations from one build of an SDK file to the next, for a live workflow that matches the older build.

    git show HEAD:n8n/sdk/turn.ts > /tmp/turn.head.ts
    python3 n8n/build/sdk_ops.py /tmp/turn.head.ts n8n/sdk/turn.ts > ops.json

Prints {"operations": [...]}: setNodeParameter for every changed parameter, addNode (with its settings) for every new node, and
removeNode for every node that's gone. Connections aren't diffed: add or remove those by hand (addConnection / removeConnection).
Use live_ops.py instead when the live copy may have drifted from the build (it compares against the live workflow itself).
"""

import json
import sys

from live_ops import sdk_nodes

old = sdk_nodes(sys.argv[1], {})
new = sdk_nodes(sys.argv[2], {})
ops = []
for name, node in new.items():
    if name not in old:
        add = {"name": name, "type": node["type"], "typeVersion": node["typeVersion"], "parameters": node["parameters"], "position": [0, 0]}
        ops.append({"type": "addNode", "node": add})
        if node["settings"]:
            ops.append({"type": "setNodeSettings", "nodeName": name, "settings": node["settings"]})
        continue
    for key, value in node["parameters"].items():
        if old[name]["parameters"].get(key) != value:
            ops.append({"type": "setNodeParameter", "nodeName": name, "path": "/" + key, "value": value})
    if node["settings"] != old[name]["settings"]:
        ops.append({"type": "setNodeSettings", "nodeName": name, "settings": node["settings"]})
ops += [{"type": "removeNode", "nodeName": n} for n in old if n not in new]
print(f"{len(ops)} operations: " + ", ".join(f"{o['type']} {o.get('nodeName') or o['node']['name']}" for o in ops), file=sys.stderr)
print(json.dumps({"operations": ops}))
