---
name: dropship-strategy-monthly
agent: ../agents/orchestrator.md
environment_id: ../environments/ops.yaml
vault_ids: [YOUR_OPS_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "29 9 1 * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "800", currency: USD}}
---

Run the STRATEGY loop for last month: portfolio and niche review, machine P&L, autonomy recommendation with evidence, and next month's priorities. Post a monthly report.
