"""Writes an n8n/wf*.json export from a saved get_workflow_details result, without credentials or ids.

    python3 n8n/build/export.py <saved details.json> n8n/wf3-turn.json
"""

import json
import sys

KEEP = ("name", "type", "typeVersion", "position", "parameters", "onError", "executeOnce", "alwaysOutputData", "retryOnFail", "maxTries", "waitBetweenTries")

live = json.load(open(sys.argv[1]))
live = live.get("workflow", live)
nodes = [{k: n[k] for k in KEEP if k in n} for n in live["nodes"]]
settings = {k: v for k, v in live.get("settings", {}).items() if k != "availableInMCP"}
json.dump({"name": live["name"], "nodes": nodes, "connections": live["connections"], "settings": settings}, open(sys.argv[2], "w"), indent=2, ensure_ascii=False)
print(f"wrote {sys.argv[2]}: {len(nodes)} nodes")
