---
name: dropship-plan-daily
agent: ../agents/orchestrator.md
environment_id: ../environments/ops.yaml
vault_ids: [YOUR_OPS_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "47 6 * * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "400", currency: USD}}
---

Run the PLAN loop. Review validated products, approve up to the open testing slots, commission marketing plans and initial creative briefs, and park or reject the rest with reasons. Close the run with a summary.
