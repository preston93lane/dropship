# Playbook (seed)

The playbook is the system's memory of what works. In the cloud it lives in the `playbook` Managed Agents
memory store (mounted at `/mnt/memory/playbook/`, versioned, read-only for every loop except IMPROVE).
These files are the **seed**: industry priors marked `confidence: prior`. The self-improver replaces
priors with evidence from this store's own tests. Seed once with `npm run playbook:seed`; after that,
treat the memory store (not these files) as the source of truth. Local Claude Code mode reads these files directly.
