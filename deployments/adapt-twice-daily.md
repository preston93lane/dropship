---
name: dropship-adapt-twice-daily
agent: ../agents/media-buyer.md
environment_id: ../environments/ops.yaml
vault_ids: [YOUR_OPS_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "37 9,18 * * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "250", currency: USD}}
---

Run the ADAPT loop. Review guardian decisions since your last run, handle winners, fatigue, near-misses and reallocation within the caps, and report anything blocked on a human. Close the run with a summary.
