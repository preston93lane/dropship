---
name: dropship-research-daily
agent: ../agents/product-analyst.md
environment_id: ../environments/research.yaml
vault_ids: [YOUR_RESEARCH_VAULT_ID]   # vlt_... from claude-lock.json after the first apply (see docs/07-setup.md)
resources:
  - {type: memory_store, memory_store_id: ../memory_stores/playbook.yaml, access: read_only, instructions: "Shared playbook. Read lessons.md, product-traits.md and creative-patterns.md before deciding."}
schedule: {type: cron, expression: "17 5 * * *", timezone: America/New_York}
budget: {type: limit, max_list_cost: {amount: "400", currency: USD}}
---

Run the RESEARCH loop for today. Niche and constraints: read the business-profile skill and the playbook's niche-notes.md. Validate at most 4 products; quality over quantity. Close the run with a summary.
