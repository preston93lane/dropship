---
name: dropship-report-daily
agent: ../agents/performance-analyst.md
environment_id: ../environments/ops.yaml
vault_ids: [YOUR_OPS_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "53 20 * * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "150", currency: USD}}
---

Run the REPORT loop: write and post today's daily P&L report with anomalies and what needs a human tomorrow.
