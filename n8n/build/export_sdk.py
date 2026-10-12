"""Writes an n8n/wf*.json export for a workflow created from an SDK file and not edited by hand since, without credentials or ids.
Node parameters come from the SDK file; names' positions and the connections come from the live workflow (a small JSON file:
{ "name", "settings", "connections", "positions": { node name: [x, y] } }, copied from get_workflow_details).

    python3 n8n/build/export_sdk.py n8n/sdk/twin.ts <live layout.json> n8n/wf6-twin.json

Use export.py instead for workflows whose live copy was changed in place (update_workflow), where the live parameters are the truth.
"""

import json
import re
import sys

sdk, layout, out = sys.argv[1:4]
live = json.load(open(layout))
src = open(sdk).read()


def to_json(ts):
    # The SDK file is JSON apart from expr("...") (an n8n expression) and newCredential(...) (dropped from exports)
    ts = re.sub(r'expr\(("(?:[^"\\]|\\.)*")\)', lambda m: json.dumps("=" + json.loads(m.group(1))), ts)
    ts = re.sub(r',?\s*"credentials": \{[^{}]*newCredential\([^)]*\)[^{}]*\}', "", ts)
    return json.loads(ts)


nodes = []
for m in re.finditer(r'const (\w+) = (?:node|trigger|ifElse)\(\{\n  type: "([^"]+)",\n  version: ([\d.]+),\n  config: (\{.*?\n  \})\n\}\);', src, re.S):
    cfg = to_json(m.group(4))
    version = float(m.group(3)) if "." in m.group(3) else int(m.group(3))
    n = {"name": cfg["name"], "type": m.group(2), "typeVersion": version, "position": live["positions"][cfg["name"]], "parameters": cfg["parameters"]}
    for k in ("onError", "executeOnce", "alwaysOutputData", "retryOnFail", "maxTries", "waitBetweenTries"):
        if k in cfg:
            n[k] = cfg[k]
    nodes.append(n)
sticky = re.search(r"sticky\('((?:[^'\\]|\\.)*)'", src)
if sticky:
    note = next((k for k in live["positions"] if k.startswith("Sticky Note")), None)
    if note:
        nodes.insert(0, {"name": note, "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": live["positions"][note],
                         "parameters": {"content": sticky.group(1).replace("\\n", "\n").replace("\\'", "'"), "color": 4}})
missing = set(live["positions"]) - {n["name"] for n in nodes}
if missing:
    sys.exit(f"nodes in the live workflow but not in {sdk}: {sorted(missing)}")
json.dump({"name": live["name"], "nodes": nodes, "connections": live["connections"], "settings": live.get("settings", {})}, open(out, "w"), indent=2, ensure_ascii=False)
print(f"wrote {out}: {len(nodes)} nodes")
