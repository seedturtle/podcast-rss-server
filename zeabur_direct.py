#!/usr/bin/env python3
"""Zeabur 暴力嘗試 - 找正確的 mutation/query 名稱與參數"""
import requests, json

API_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
H = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
API = "https://api.zeabur.com/graphql"
PROJ_ID = "69bd9f7fceee47754dabae92"

def gql(q, t=30):
    r = requests.post(API, headers=H, json={"query": q}, timeout=t)
    return r.json()

# 直接列出所有 mutation 名稱（不需要 introspection）
d = gql('{ __schema { mutationType { fields { name } } } }')
mut_names = [f["name"] for f in d.get("data",{}).get("__schema",{}).get("mutationType",{}).get("fields",[])]
print("✅ Mutation names:", mut_names)

# 直接列出所有 query 名稱
d = gql('{ __schema { queryType { fields { name } } } }')
q_names = [f["name"] for f in d.get("data",{}).get("__schema",{}).get("queryType",{}).get("fields",[])]
print("✅ Query names:", q_names)

# 直接測試 createService 與 redeployService
print("\n=== createService ===")
d = gql("""
mutation {
  createService(input: {projectId: "%s", name: "podcast-rss-server", template: "blank"}) {
    __typename
  }
}
""" % PROJ_ID)
print(json.dumps(d, indent=2, ensure_ascii=False)[:400])

print("\n=== redeployService ===")
d = gql("""
mutation {
  redeployService(input: {serviceId: "test"}) {
    __typename
  }
}
""")
print(json.dumps(d, indent=2, ensure_ascii=False)[:400])
