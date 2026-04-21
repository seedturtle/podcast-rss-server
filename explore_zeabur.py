#!/usr/bin/env python3
"""
Zeabur 部署腳本 - 完整版
使用 _id query 繞過 Permission denied
"""
import requests, json, time

API_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
H = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
API = "https://api.zeabur.com/graphql"
USER_ID = "6979fa1ba6facef792c7a218"

def gql(q, timeout=30):
    r = requests.post(API, headers=H, json={"query": q}, timeout=timeout)
    return r.json()

# ── Step 1: 探索 User._id ──
print("Step 1: 探索 User schema")
d = gql('{ __type(name: "User") { fields { name type { name kind ofType { name } } } } }')
for f in d.get("data",{}).get("__type",{}).get("fields",[]):
    t = f["type"]
    print(f"  {f['name']}: kind={t['kind']} ofType={t.get('ofType',{}).get('name','')}")

print()
# ── Step 2: 探索所有可用 query ──
print("Step 2: 可用 Query")
d = gql("{ __schema { queryType { fields { name type { name kind ofType { name } } } } } }")
for f in d.get("data",{}).get("__schema",{}).get("queryType",{}).get("fields",[]):
    t = f["type"]
    print(f"  {f['name']}: {t.get('ofType',{}).get('name', t['name'])}")
