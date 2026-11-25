---
name: dropship-improve-weekly
agent: ../agents/self-improver.md
environment_id: ../environments/improve.yaml
vault_ids: [YOUR_IMPROVE_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_write, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "41 7 * * 0", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "1200", currency: USD}}
---

Run the weekly IMPROVE loop: retrospective, playbook update, calibration, experiments, model scouting, proposals and machine-ROI review. Post the retro report and close the run.
