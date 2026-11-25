# Product-scoring backtest

Built from real outcomes, so it starts empty and grows with every concluded test.

1. `gw GET /v1/outcomes` → products with `outcome` winner/loser and their stored score `components`.
2. Re-score each with the current weights and with proposed weights (or a proposed rubric change applied by
   re-judging components from the stored research evidence).
3. Metric: AUC (probability a random winner outscores a random loser) and hit rate of the top-quartile.
4. A change ships only if AUC does not drop. With fewer than 6 winners, report the result as directional only.
