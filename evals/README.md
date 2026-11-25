# Evals

Evals keep self-improvement honest: a proposed change to a skill or agent prompt must keep (or raise) the
pass rate on known cases. The self-improver runs them inside its session (no extra infrastructure):
read each case, apply the skill as written (before) and with the proposed edit (after), grade against
`expected`, and report both pass rates in the proposal's `eval` field.

| Suite | What it checks | Grading |
|---|---|---|
| `compliance/cases.jsonl` | The compliance-reviewer's verdict on ad copy/scripts | exact match on `verdict`; every `must_flag` term appears in an issue |
| `product-scoring/` | Research scoring vs. real outcomes (backtest) | winners ranked above losers (AUC); built from `GET /v1/outcomes` |

Add a case whenever a real failure happens (a disapproved ad, a bad product that slipped through):
the eval set should grow from production mistakes. Never delete a case to make a change pass.
