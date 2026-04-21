#!/usr/bin/env python3
"""Zeabur 部署腳本 - 直接使用 api.zeabur.com GraphQL"""
import requests, json

API_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
API     = "https://api.zeabur.com/graphql"

def gql(q, vars_=None):
    r = requests.post(API, headers=HEADERS, json={"query": q, "variables": vars_ or {}}, timeout=30)
    return r.status_code, r.text[:600]

# 1. 嘗試找正確的頂層查詢
print("=== 探索 API ===")
for q in ['me', 'viewer', 'user']:
    code, txt = gql(f"{{ {q} {{ __typename }}}}")
    print(f"  {q}: {code} | {txt[:150]}")
print()

# 2. introspection
code, txt = gql("{ __schema { queryType { name } types { name } } }")
d = json.loads(txt) if txt.startswith('{') else {}
types = [t["name"] for t in d.get("data",{}).get("__schema",{}).get("types",[])]
print("類型:", [t for t in types if any(x in t.lower() for x in ["project","service","deploy","github"])])
print()

# 3. 找可用的 mutation
code, txt = gql("{ __schema { mutationType { name fields { name } } } }")
d = json.loads(txt) if txt.startswith('{') else {}
for f in d.get("data",{}).get("__schema",{}).get("mutationType",{}).get("fields",[]):
    print("mutation:", f["name"])
