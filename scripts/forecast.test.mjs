import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "./forecast.ts";

test("forecast is deterministic for a seed and scenarios are ordered sensibly", () => {
  const a = runScenario("base", 5000, 400, 11);
  const b = runScenario("base", 5000, 400, 11);
  assert.deepEqual(a.year, b.year, "same seed, same result");

  const cons = runScenario("conservative", 5000, 600, 3);
  const base = runScenario("base", 5000, 600, 3);
  const opt = runScenario("optimistic", 5000, 600, 3);
  assert.ok(cons.pYearProfitable < base.pYearProfitable && base.pYearProfitable < opt.pYearProfitable);
  assert.ok(cons.pWinnerBy.month12 <= base.pWinnerBy.month12 && base.pWinnerBy.month12 <= opt.pWinnerBy.month12);
});

test("a store that never finds a real winner loses roughly its testing capital, not more", () => {
  for (const capital of [3000, 5000]) {
    const r = runScenario("conservative", capital, 600, 5);
    assert.ok(r.ifNoRealWinner.share > 0);
    // shut down once cash falls below the reserve: the loss is bounded by the capital
    assert.ok(r.ifNoRealWinner.yearNet.p10 > -capital, `loss bounded at ${capital}`);
    assert.ok(r.ifNoRealWinner.yearNet.p90 < 0);
  }
});

test("more starting capital buys more tests and a better chance of a real winner", () => {
  const small = runScenario("base", 3000, 800, 9);
  const large = runScenario("base", 5000, 800, 9);
  assert.ok(large.pWinnerBy.month12 > small.pWinnerBy.month12);
  assert.ok(large.pRanOutBeforeWinner < small.pRanOutBeforeWinner);
});
