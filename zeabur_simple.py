#!/usr/bin/env python3
"""Zeabur 最簡化測試 - 只用 __typename"""
import requests, json

API_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
H = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
API = "https://api.zeabur.com/graphql"

def gql(q, t=30):
    r = requests.post(API, headers=H, json={"query": q}, timeout=t)
    return r.json()

# 直接測試各 mutation 的 __typename（不需要知道return type結構）
tests = [
    ("createService", """
mutation {
  createService(input: {projectId: "69bd9f7fceee47754dabae92", name: "podcast-rss", template: "blank"}) {
    __typename
  }
}
"""),
    ("redeployService", """
mutation {
  redeployService(input: {serviceId: "abc"}) {
    __typename
  }
}
"""),
    ("createService2", """
mutation {
  createService(input: {projectId: "69bd9f7fceee47754dabae92", name: "podcast-rss"}) {
    __typename
  }
}
"""),
]

for name, q in tests:
    d = gql(q)
    data = d.get("data", {})
    errs = d.get("errors", [])
    if errs:
        print(f"{name}: ❌ {errs[0]['message'][:100]}")
    else:
        print(f"{name}: ✅ {json.dumps(data, ensure_ascii=False)[:200]}")
