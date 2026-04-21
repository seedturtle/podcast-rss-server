#!/usr/bin/env python3
"""Zeabur 部署 - 暴力嘗試可用 mutations"""
import requests, json

API_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
H = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
API = "https://api.zeabur.com/graphql"
PROJ_ID = "69bd9f7fceee47754dabae92"

def gql(q, timeout=25):
    r = requests.post(API, headers=H, json={"query": q}, timeout=timeout)
    return r.json()

def try_mutation(name, q):
    print(f"\n  嘗試 mutation: {name}")
    d = gql(q)
    errs = d.get("errors", [])
    if errs:
        print(f"    ❌ {errs[0]['message'][:100]}")
        return None
    print(f"    ✅ {json.dumps(d.get('data',{}), indent=2, ensure_ascii=False)[:200]}")
    return d.get("data")

# ── 嘗試建立服務 ──
print("=== 建立服務 ===")
try_mutation("createService", """
mutation {
  createService(input: {
    projectId: "%s"
    name: "podcast-rss-server"
    template: "blank"
  }) {
    service { _id name }
  }
}
""" % PROJ_ID)

# ── 嘗試建立並直接部署 ──
print("\n=== 直接建立+部署 ===")
try_mutation("deploy", """
mutation {
  deployService(input: {
    serviceId: "podcast-rss-server"
    github: { repo: "seedturtle/podcast-rss-server", branch: "main" }
  }) {
    success
  }
}
""")

# ── 嘗試用 _id 直接 query ──
print("\n=== 查現有服務（_id）===")
d = gql('{ __schema { queryType { fields { name args { name type { name } } } } } }')
for f in d.get("data",{}).get("__schema",{}).get("queryType",{}).get("fields",[]):
    print(f"  query: {f['name']} | args: {[a['name'] for a in f.get('args',[])]}")
