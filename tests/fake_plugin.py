"""Simulates the Figma plugin UI against a running bridge (end-to-end smoke test)."""
import json
import sys
import threading
import time
import urllib.request

import os
BASE = os.environ.get("BASE", "http://localhost:3055")
TOKEN = os.environ.get("FIGMA_AGENT_TOKEN", "")  # pairing key (the bridge refuses requests without one)


def url(path):
    return BASE + path + ("&" if "?" in path else "?") + "t=" + TOKEN


def post(path, body):
    req = urllib.request.Request(url(path), data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "text/plain"})
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


FAKE = {
    "page_overview": {"pages": [{"id": "0:1", "name": "App"}], "current": "App",
                      "topLevel": [{"id": "1:2", "name": "Login", "type": "FRAME", "x": 0, "y": 0, "w": 390, "h": 844},
                                   {"id": "1:3", "name": "Home", "type": "FRAME", "x": 500, "y": 0, "w": 390, "h": 844}]},
    "execute": {"result": {"created": ["9:1", "9:2"]}},
}

done = threading.Event()
t0 = time.time()


def listen():
    resp = urllib.request.urlopen(url("/events"), timeout=300)
    for raw in resp:
        line = raw.decode().strip()
        if not line.startswith("data: "):
            continue
        ev = json.loads(line[6:])
        if ev["type"] == "delta":
            sys.stdout.write(ev["text"]); sys.stdout.flush()
        else:
            print("\n[%.1fs] EVENT %s" % (time.time() - t0, json.dumps(ev, ensure_ascii=False)[:300]))
        if ev["type"] == "exec":
            post("/result", {"id": ev["id"], "ok": True, "data": FAKE.get(ev["op"], {"ok": True})})
        if ev["type"] == "done":
            done.set()
            return


threading.Thread(target=listen, daemon=True).start()
time.sleep(1)
t0 = time.time()
ctx = {"file": "Test", "editor": "figma", "page": {"id": "0:1", "name": "App"},
       "selection": [{"id": "1:2", "name": "Login", "type": "FRAME"}, {"id": "1:3", "name": "Home", "type": "FRAME"}]}
print(post("/prompt", {"text": sys.argv[1] if len(sys.argv) > 1 else "Connect these two screens into a flow", "context": ctx}))
done.wait(240)
print("\nTOTAL %.1fs" % (time.time() - t0))
