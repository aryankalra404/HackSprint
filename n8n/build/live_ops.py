"""Turns local changes to a workflow into update_workflow operations for the live copy in n8n.

    python3 n8n/build/build.py
    # save the live workflow: n8n MCP get_workflow_details {"workflowId": "..."} -> live.json
    python3 n8n/build/live_ops.py n8n/sdk/prep.ts live.json > ops.json

It reads the node configs out of the generated SDK code, compares each node's parameters with the live
workflow, and prints {"operations": [...]} with a setNodeParameter for every parameter that differs. Send
them with update_workflow (add "workflowId"), then publish_workflow. Nodes that are new or gone are listed
on stderr: add them with addNode (plus setNodeSettings for onError and retries) and wire them with
addConnection, or rebuild the whole workflow with create_workflow_from_code.
Credentials in the generated code are names only; this fills in the live workflow's own credential for that type.
"""

import json
import re
import sys

HEADER = re.compile(r'const (\w+) = (?:node|trigger|ifElse|languageModel|tool)\(\{\n  type: "([^"]+)",\n  version: ([\d.]+),\n  config: ')
# An agent's sub-nodes are SDK references, not JSON (connections in n8n, so left out here)
SUBNODES = re.compile(r',\n\s*"subnodes": \{[^{}]*\}')


def sdk_nodes(path, credentials):
    """Each node in the SDK file as n8n node JSON: expr("x") becomes "=x", newCredential("Name") the credential given for it."""
    src = SUBNODES.sub("", open(path).read())
    decoder = json.JSONDecoder()
    nodes = {}
    for m in HEADER.finditer(src):
        out, depth, j = [], 0, m.end()
        while True:
            if src.startswith("expr(", j):
                s, j = decoder.raw_decode(src, j + 5)
                out.append(json.dumps("=" + s))
                j += 1
                continue
            if src.startswith("newCredential(", j):
                s, j = decoder.raw_decode(src, j + 14)
                out.append(json.dumps(credentials.get(s)))
                j += 1
                continue
            if src[j] == '"':
                _, k = decoder.raw_decode(src, j)
                out.append(src[j:k])
                j = k
                continue
            out.append(src[j])
            depth += {"{": 1, "}": -1}.get(src[j], 0)
            j += 1
            if depth == 0:
                break
        config = json.loads("".join(out))
        config.pop("output", None)
        name = config.pop("name")
        nodes[name] = {"name": name, "type": m.group(2), "typeVersion": json.loads(m.group(3)),
                       "parameters": config.pop("parameters", {}), "credentials": config.pop("credentials", None), "settings": config}
    return nodes


def main():
    sdk_path, live_path = sys.argv[1], sys.argv[2]
    live = json.load(open(live_path))
    live = live.get("workflow", live)
    by_name = {n["name"]: n for n in live["nodes"]}
    # The generated code names credentials by type's display name ("Gemini"); map each to the live one of that type
    live_creds = {}
    for n in live["nodes"]:
        for key, cred in (n.get("credentials") or {}).items():
            live_creds[key] = cred
    names = {"Gemini": live_creds.get("googlePalmApi"), "Gmail": live_creds.get("gmailOAuth2"), "Google Calendar": live_creds.get("googleCalendarOAuth2Api")}
    local = sdk_nodes(sdk_path, names)
    ops = []
    for name, node in local.items():
        if name not in by_name:
            continue
        for key, value in node["parameters"].items():
            if by_name[name]["parameters"].get(key) != value:
                ops.append({"type": "setNodeParameter", "nodeName": name, "path": "/" + key, "value": value})
    new = [n for n in local if n not in by_name]
    gone = [n for n in by_name if n not in local and not by_name[n]["type"].endswith("stickyNote")]
    print(f"{len(ops)} parameter changes; new nodes: {new or 'none'}; gone: {gone or 'none'}", file=sys.stderr)
    for op in ops:
        print(f"  {op['nodeName']}: {op['path']}", file=sys.stderr)
    print(json.dumps({"operations": ops}))


if __name__ == "__main__":
    main()
