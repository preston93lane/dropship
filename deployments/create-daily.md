---
name: dropship-create-daily
agent: ../agents/creative-director.md
environment_id: ../environments/creative.yaml
vault_ids: [YOUR_CREATIVE_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "23 8 * * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "1000", currency: USD}}
---

Run the CREATE loop. Work open briefs in priority order (refresh_fatigue, iterate_winner, initial_test, new_angles). Stop starting new creatives once this run's LLM budget is 80% used or media spend for the day passes $40. Close the run with a summary.
