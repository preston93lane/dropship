/**
 * Year-one financial forecast (Monte Carlo). Simulates the business week by week, thousands of times:
 * product tests (most lose), the guardian's kills, near-misses that get a second creative round, winners that
 * scale with diminishing returns and fade as competitors copy them, ad-cost seasonality, the machine's own
 * costs, and your cash balance.
 *
 *   npm run forecast                          # base scenario, 5,000 runs, $5,000 starting capital
 *   npm run forecast -- --scenario conservative --capital 3000
 *   npm run forecast -- --scenario all        # compare conservative / base / optimistic
 *
 * Calibration (sources in docs/research/2026-11-first-products-and-forecast.md):
 * - Median ecommerce Meta ROAS 1.88 (Triple Whale, 40k+ brands, Aug 2025-Jul 2026) is a *survivor* benchmark:
 *   established brands with repeat buyers and email. A new store's product TESTS do much worse: most failed
 *   tests get 0-2 sales. We model test ROAS medians of ~0.9-1.2 against a breakeven ROAS of ~2.05 for our
 *   mid-ticket products, i.e. true CPA / breakeven CPA medians of 1.7-2.3, with a wide spread.
 * - Small test samples mislead: an observed winner can be a false positive (measurement noise below), which
 *   then fails to scale. Store success rates of ~1-20% (TrueProfit, Podbase, Getcarro) are the sanity check.
 * - Q4 CPMs run ~25% above Q1 (Nov peak, Jan trough); purchase intent rises in Q4, so the CPA effect is smaller.
 */
import { mulberry32 } from "../supabase/functions/_shared/core/stats.ts";

interface Scenario {
  name: string;
  /** Median of (true CPA / breakeven CPA) across products this store tests, at launch. */
  rMedian: number;
  rSigma: number;
  /** Monthly improvement of rMedian from learning (playbook, calibration, creative iteration). */
  monthlyLearning: number;
  testsPerMonth: { early: number; later: number; withTwoWinners: number };
  /** Monthly fade of a winner's CPA after copycats and fatigue (net of creative refreshes). */
  winnerDrift: number;
  /** Diminishing returns: CPA grows with (spend/startDaily)^beta. */
  beta: number;
}

const SCENARIOS: Record<string, Scenario> = {
  conservative: { name: "Conservative", rMedian: 2.3, rSigma: 0.55, monthlyLearning: 0.0, testsPerMonth: { early: 5, later: 4, withTwoWinners: 2 }, winnerDrift: 1.06, beta: 0.14 },
  base: { name: "Base", rMedian: 2.0, rSigma: 0.6, monthlyLearning: 0.015, testsPerMonth: { early: 6, later: 4, withTwoWinners: 2 }, winnerDrift: 1.05, beta: 0.12 },
  optimistic: { name: "Optimistic", rMedian: 1.7, rSigma: 0.6, monthlyLearning: 0.025, testsPerMonth: { early: 6, later: 5, withTwoWinners: 3 }, winnerDrift: 1.04, beta: 0.11 },
};

const COMMON = {
  weeks: 52,
  startMonth: 0, // 0 = January (first tests run in January, after the BFCM CPM peak)
  setupCost: 300, // domain, product samples, misc (spent in December, booked in January)
  toolsPerMonth: 85, // Shopify Basic + apps + domain amortized; Supabase free tier
  machine: { lean: 180, standard: 520, scale: 1000 }, // LLM + media per month by mode (docs/03-costs-and-roi.md)
  mediaPerTest: 15,
  mediaPerIteration: 10,
  breakevenRange: [29, 48] as [number, number], // contribution per order of the candidate products ($)
  contributionMarginRange: [0.44, 0.5] as [number, number], // contribution / price
  winnerThreshold: 0.8, // r below this is declared a winner (guardian: confident below target CPA)
  nearMissBand: [0.8, 1.0] as [number, number], // gets one more creative round
  iterationShift: { mu: -0.05, sigma: 0.2 }, // new angles: slightly better on average, wide spread
  measurementNoise: 0.25, // observed test CPA vs true CPA (lognormal sigma): a few sales can mislead
  startDaily: 40,
  weeklyRamp: 1.35, // ~+20% every 2-3 days, the guardian's max step
  rCap: 0.78, // stop scaling when marginal CPA reaches ~0.78x breakeven (between target and breakeven)
  maxDaily: 1500,
  minCashReserve: 300, // stop launching tests below this
  // CPA seasonality index by month (Jan..Dec): CPM swings ~25% Q1->Q4, partly offset by higher Q4 purchase intent
  season: [1.0, 0.97, 0.98, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.03, 1.12, 1.08],
};

type MonthStats = { adSpend: number; revenue: number; contribution: number; machine: number; net: number; cash: number; winners: number; tests: number };
interface RunResult {
  months: MonthStats[];
  firstWinnerWeek: number | null;
  firstRealWinnerWeek: number | null;
  shutDownWeek: number | null;
  minCash: number;
  ranOutOfCapital: boolean;
  winnersFound: number;
}

function normal(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const uniform = (rng: () => number, [a, b]: [number, number]) => a + (b - a) * rng();

function simulate(sc: Scenario, capital: number, rng: () => number): RunResult {
  const months: MonthStats[] = Array.from({ length: 12 }, () => ({ adSpend: 0, revenue: 0, contribution: 0, machine: 0, net: 0, cash: 0, winners: 0, tests: 0 }));
  // one-time setup (domain, samples, first month of apps) is booked in January so month one shows everything spent
  let cash = capital - COMMON.setupCost;
  months[0]!.machine += COMMON.setupCost;
  months[0]!.net -= COMMON.setupCost;
  let minCash = cash;
  let firstWinnerWeek: number | null = null;
  let firstRealWinnerWeek: number | null = null;
  let shutDownWeek: number | null = null;
  let winnersFound = 0;
  let ranOut = false;
  let testCarry = 0;
  const winners: { r: number; be: number; cm: number; daily: number; probation?: boolean }[] = [];

  for (let w = 0; w < COMMON.weeks; w++) {
    const m = Math.min(11, Math.floor(w / (52 / 12)));
    const ms = months[m]!;
    // Out of capital with nothing working: a real operator stops here (no more tests, tools or machine costs).
    if (shutDownWeek === null && winners.length === 0 && cash < COMMON.minCashReserve) {
      shutDownWeek = w;
      if (firstRealWinnerWeek === null) ranOut = true;
    }
    if (shutDownWeek !== null && winners.length === 0) {
      ms.cash = cash;
      continue;
    }
    const season = COMMON.season[(COMMON.startMonth + m) % 12]!;
    const rMed = sc.rMedian * Math.pow(1 - sc.monthlyLearning, m);
    const weekFirstOfMonth = Math.floor((w - 1) / (52 / 12)) !== m || w === 0;

    // Monthly fixed + machine costs (charged in the first week of each month)
    if (weekFirstOfMonth) {
      const monthAdSpendGuess = winners.reduce((s, x) => s + x.daily * 30, 0);
      const mode = winners.length === 0 ? "lean" : monthAdSpendGuess > 20000 ? "scale" : "standard";
      const cost = COMMON.toolsPerMonth + COMMON.machine[mode];
      ms.machine += cost;
      ms.net -= cost;
      cash -= cost;
    }

    // Launch this week's tests
    const perMonth = winners.length >= 2 ? sc.testsPerMonth.withTwoWinners : m < 3 ? sc.testsPerMonth.early : sc.testsPerMonth.later;
    testCarry += perMonth / (52 / 12);
    while (testCarry >= 1) {
      testCarry -= 1;
      if (cash < COMMON.minCashReserve) continue;
      ms.tests += 1;
      const be = uniform(rng, COMMON.breakevenRange);
      const cm = uniform(rng, COMMON.contributionMarginRange);
      let r = rMed * Math.exp(sc.rSigma * normal(rng)) * season;
      // each test runs 3-5 ads; duds burn ~4x breakeven before every ad is killed, contenders use the full 6x budget
      let spend = be * (r >= 1.8 ? 4 : 6);
      let media = COMMON.mediaPerTest;
      let observed = r * Math.exp(COMMON.measurementNoise * normal(rng));
      if (observed >= COMMON.nearMissBand[0] && observed < COMMON.nearMissBand[1]) {
        // near-miss: one round of new angles
        const r2 = r * Math.exp(COMMON.iterationShift.mu + COMMON.iterationShift.sigma * normal(rng));
        spend += be * 3;
        media += COMMON.mediaPerIteration;
        r = Math.min(r, r2);
        observed = r * Math.exp(COMMON.measurementNoise * normal(rng));
      }
      const won = observed < COMMON.winnerThreshold;
      const orders = spend / (r * be);
      const contribution = orders * be - spend;
      ms.adSpend += spend;
      ms.revenue += (orders * be) / cm;
      ms.contribution += contribution;
      ms.machine += media;
      ms.net += contribution - media;
      cash += contribution - media;
      if (won) {
        // scaling uses the TRUE CPA: false positives run a week at test budget, then get retired by the cap check
        winners.push({ r: r / season, be, cm, daily: COMMON.startDaily / COMMON.weeklyRamp, probation: true });
        winnersFound += 1;
        if (firstWinnerWeek === null) firstWinnerWeek = w;
        if (firstRealWinnerWeek === null && r / season < COMMON.rCap) firstRealWinnerWeek = w;
      }
    }

    // Run winners for the week
    for (let i = winners.length - 1; i >= 0; i--) {
      const wn = winners[i]!;
      const cap = COMMON.startDaily * Math.pow(COMMON.rCap / wn.r, 1 / sc.beta);
      if (cap < COMMON.startDaily && !wn.probation) {
        winners.splice(i, 1); // faded below profitability (or a false positive): retire
        continue;
      }
      wn.daily = wn.probation ? COMMON.startDaily : Math.min(wn.daily * COMMON.weeklyRamp, cap, COMMON.maxDaily);
      wn.probation = false;
      const spend = wn.daily * 7;
      const rs = wn.r * Math.pow(wn.daily / COMMON.startDaily, sc.beta) * season;
      const orders = spend / (rs * wn.be);
      const contribution = orders * wn.be - spend;
      ms.adSpend += spend;
      ms.revenue += (orders * wn.be) / wn.cm;
      ms.contribution += contribution;
      ms.net += contribution;
      cash += contribution;
      wn.r *= Math.pow(sc.winnerDrift, 12 / 52);
    }
    ms.winners = Math.max(ms.winners, winners.length);
    ms.cash = cash;
    minCash = Math.min(minCash, cash);
  }
  return { months, firstWinnerWeek, firstRealWinnerWeek, shutDownWeek, minCash, ranOutOfCapital: ranOut, winnersFound };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]!;
};
const usd = (n: number) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function runScenario(key: string, capital: number, runs: number, seed = 7) {
  const sc = SCENARIOS[key]!;
  const rng = mulberry32(seed);
  const results = Array.from({ length: runs }, () => simulate(sc, capital, rng));
  const monthly = MONTHS.map((label, m) => {
    const col = (k: keyof MonthStats) => results.map((r) => r.months[m]![k]);
    return {
      month: label,
      adSpend: { p10: pct(col("adSpend"), 10), p50: pct(col("adSpend"), 50), p90: pct(col("adSpend"), 90) },
      revenue: { p10: pct(col("revenue"), 10), p50: pct(col("revenue"), 50), p90: pct(col("revenue"), 90) },
      net: { p10: pct(col("net"), 10), p50: pct(col("net"), 50), p90: pct(col("net"), 90) },
      cash: { p10: pct(col("cash"), 10), p50: pct(col("cash"), 50), p90: pct(col("cash"), 90) },
      winners: pct(col("winners"), 50),
    };
  });
  const year = (k: keyof MonthStats) => results.map((r) => r.months.reduce((s, x) => s + (x[k] as number), 0));
  const byWeek = (w: number) => results.filter((r) => r.firstRealWinnerWeek !== null && r.firstRealWinnerWeek <= w).length / runs;
  const yearNet = year("net");
  const sumOf = (r: RunResult, k: keyof MonthStats) => r.months.reduce((s, x) => s + (x[k] as number), 0);
  const slice = (rs: RunResult[]) => ({
    share: rs.length / runs,
    yearRevenue: rs.length ? pct(rs.map((r) => sumOf(r, "revenue")), 50) : 0,
    yearAdSpend: rs.length ? pct(rs.map((r) => sumOf(r, "adSpend")), 50) : 0,
    yearNet: rs.length
      ? { p10: pct(rs.map((r) => sumOf(r, "net")), 10), p50: pct(rs.map((r) => sumOf(r, "net")), 50), p90: pct(rs.map((r) => sumOf(r, "net")), 90) }
      : { p10: 0, p50: 0, p90: 0 },
    month12Revenue: rs.length ? pct(rs.map((r) => r.months[11]!.revenue), 50) : 0,
    month12Net: rs.length ? pct(rs.map((r) => r.months[11]!.net), 50) : 0,
  });
  const bucket = (lo: number, hi: number) => yearNet.filter((x) => x >= lo && x < hi).length / runs;
  return {
    scenario: sc.name,
    capital,
    runs,
    hitRateApprox: results.reduce((s, r) => s + r.winnersFound, 0) / Math.max(1, results.reduce((s, r) => s + r.months.reduce((t, x) => t + x.tests, 0), 0)),
    pWinnerBy: { month2: byWeek(8), month3: byWeek(13), month6: byWeek(26), month12: byWeek(51) },
    pYearProfitable: yearNet.filter((x) => x > 0).length / runs,
    pRanOutBeforeWinner: results.filter((r) => r.ranOutOfCapital).length / runs,
    pFalsePositiveFirst: results.filter((r) => r.firstWinnerWeek !== null && (r.firstRealWinnerWeek === null || r.firstWinnerWeek < r.firstRealWinnerWeek)).length / runs,
    capitalLowPoint: { p50: pct(results.map((r) => r.minCash), 50), p10: pct(results.map((r) => r.minCash), 10) },
    ifRealWinner: slice(results.filter((r) => r.firstRealWinnerWeek !== null)),
    ifNoRealWinner: slice(results.filter((r) => r.firstRealWinnerWeek === null)),
    outcomes: {
      lostOver1k: bucket(-Infinity, -1000),
      lostUnder1k: bucket(-1000, 0),
      profit0to10k: bucket(0, 10_000),
      profit10kTo50k: bucket(10_000, 50_000),
      profitOver50k: bucket(50_000, Infinity),
    },
    year: {
      revenue: { p10: pct(year("revenue"), 10), p50: pct(year("revenue"), 50), p90: pct(year("revenue"), 90) },
      adSpend: { p10: pct(year("adSpend"), 10), p50: pct(year("adSpend"), 50), p90: pct(year("adSpend"), 90) },
      machine: { p50: pct(year("machine"), 50) },
      net: { p10: pct(yearNet, 10), p50: pct(yearNet, 50), p90: pct(yearNet, 90) },
    },
    month12RevenueRunRate: { p10: pct(results.map((r) => r.months[11]!.revenue), 10), p50: pct(results.map((r) => r.months[11]!.revenue), 50), p90: pct(results.map((r) => r.months[11]!.revenue), 90) },
    monthly,
  };
}

function printReport(r: ReturnType<typeof runScenario>) {
  const p = (x: number) => Math.round(x * 100) + "%";
  console.log(`\n## ${r.scenario} scenario · ${usd(r.capital)} starting capital · ${r.runs.toLocaleString()} simulated years\n`);
  console.log(`Declared-winner rate per test ≈ ${p(r.hitRateApprox)} (incl. false positives; ${p(r.pFalsePositiveFirst)} of stores see a false positive first) · P(first REAL winner by end of month 2) ${p(r.pWinnerBy.month2)} · month 3 ${p(r.pWinnerBy.month3)} · month 6 ${p(r.pWinnerBy.month6)} · within the year ${p(r.pWinnerBy.month12)}`);
  console.log(`P(year one net-positive) ${p(r.pYearProfitable)} · P(capital runs out before any winner) ${p(r.pRanOutBeforeWinner)} · cash low point: median ${usd(r.capitalLowPoint.p50)}, bad case (p10) ${usd(r.capitalLowPoint.p10)}\n`);
  console.log("| Month | Ad spend (median) | Revenue p10 / median / p90 | Net p10 / median / p90 | Cash balance (median) | Live winners |");
  console.log("|---|---|---|---|---|---|");
  for (const m of r.monthly) {
    console.log(`| ${m.month} | ${usd(m.adSpend.p50)} | ${usd(m.revenue.p10)} / ${usd(m.revenue.p50)} / ${usd(m.revenue.p90)} | ${usd(m.net.p10)} / ${usd(m.net.p50)} / ${usd(m.net.p90)} | ${usd(m.cash.p50)} | ${m.winners} |`);
  }
  console.log(`\nYear one: revenue ${usd(r.year.revenue.p10)} / ${usd(r.year.revenue.p50)} / ${usd(r.year.revenue.p90)} (p10/median/p90) · ad spend median ${usd(r.year.adSpend.p50)} · machine + tools median ${usd(r.year.machine.p50)} · net ${usd(r.year.net.p10)} / ${usd(r.year.net.p50)} / ${usd(r.year.net.p90)}`);
  console.log(`Month-12 revenue run rate: ${usd(r.month12RevenueRunRate.p10)} / ${usd(r.month12RevenueRunRate.p50)} / ${usd(r.month12RevenueRunRate.p90)} per month`);
  const w = r.ifRealWinner;
  const n = r.ifNoRealWinner;
  console.log(`\nIf you find a real winner (${p(w.share)} of runs): year revenue median ${usd(w.yearRevenue)} · ad spend ${usd(w.yearAdSpend)} · net ${usd(w.yearNet.p10)} / ${usd(w.yearNet.p50)} / ${usd(w.yearNet.p90)} · month 12: revenue ${usd(w.month12Revenue)}, net ${usd(w.month12Net)}`);
  console.log(`If you don't (${p(n.share)} of runs): net ${usd(n.yearNet.p10)} / ${usd(n.yearNet.p50)} / ${usd(n.yearNet.p90)} (the testing budget is spent and the store is shut down)`);
  const o = r.outcomes;
  console.log(`Year-one outcomes: lost > $1k ${p(o.lostOver1k)} · lost < $1k ${p(o.lostUnder1k)} · profit $0-10k ${p(o.profit0to10k)} · $10-50k ${p(o.profit10kTo50k)} · > $50k ${p(o.profitOver50k)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name: string, d: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1]! : d;
  };
  const scenario = arg("scenario", "base");
  const capital = Number(arg("capital", "5000"));
  const runs = Number(arg("runs", "5000"));
  const keys = scenario === "all" ? Object.keys(SCENARIOS) : [scenario];
  const out = keys.map((k) => runScenario(k, capital, runs));
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
  else out.forEach(printReport);
}
