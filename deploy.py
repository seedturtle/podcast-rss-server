#!/usr/bin/env python3
"""
拉拉熊晨間廣播 RSS Server — Zeabur 部署腳本
一次執行：認證 → 建立服務 → 設定 GitHub → 部署
"""
import requests, json, time, sys

ZEABUR_KEY = "sk-bc2qno2tw5rwv2tmiw5z7ulrp3r37"
API        = "https://api.zeabur.com/graphql"
HEADERS    = {"Authorization": f"Bearer {ZEABUR_KEY}", "Content-Type": "application/json"}

def gql(q, vars=None):
    r = requests.post(API, headers=HEADERS, json={"query": q, "variables": vars or {}}, timeout=30)
    try:
        d = r.json()
        if d.get("errors"):
            print("  ⚠️ GraphQL errors:", json.dumps(d["errors"], indent=2, ensure_ascii=False)[:300])
        return d
    except Exception as e:
        print("  ❌ Request failed:", e)
        return {}

# ── Step 1: 健康檢查 ──────────────────────────────────
print("🔍 Step 1: API 健康檢查")
r = requests.get(f"{API.replace('graphql','health')}", timeout=10)
print(f"  API health: {r.status_code} | {r.text[:100]}")
print()

# ── Step 2: introspection — 找正確的 schema ─────────
print("🔍 Step 2: 取得 Schema 類型")
r = requests.post(API, headers=HEADERS,
    json={"query": "{ __schema { queryType { name fields { name type { name kind ofType { name } } } } } }"},
    timeout=15)
d = r.json()
fields = d.get("data",{}).get("__schema",{}).get("queryType",{}).get("fields",[])
field_names = [f["name"] for f in fields]
print(f"  Query fields: {field_names}")
print()

# ── Step 3: 用第一層 query 探索專案 ──────────────────
for f in fields[:5]:
    fname = f["name"]
    of_name = f.get("ofType",{}).get("name","")
    print(f"  → {fname} (ofType={of_name})")

# ── Step 4: 嘗試列出專案（用可能的 field name）────────
print()
print("🔍 Step 4: 列出專案")
for qname in ["me", "user", "project", "projects", "nodes"]:
    if qname not in field_names:
        continue
    print(f"\n  測試 query: {qname}")
    r = requests.post(API, headers=HEADERS,
        json={"query": f"{{ {qname} {{ __typename }}}}"},
        timeout=15)
    print(f"  → {r.status_code} | {r.text[:200]}")
