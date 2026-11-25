/**
 * Quick unit-economics calculator (same code the gateway uses).
 *   npm run economics -- --cogs 8.5 --shipping 4.5 [--price 39.99] [--platform-fee 0.06]
 */
import { checkMarginGates, suggestPrice, unitEconomics } from "../supabase/functions/_shared/core/economics.ts";

const arg = (name: string): number | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : undefined;
};
const cogs = arg("cogs");
const shipping = arg("shipping") ?? 0;
if (cogs === undefined) {
  console.error("usage: npm run economics -- --cogs <n> --shipping <n> [--price <n>] [--platform-fee <pct>] [--refund-rate <pct>]");
  process.exit(2);
}
const price = arg("price") ?? suggestPrice(cogs + shipping);
const ue = unitEconomics({
  price,
  cogs,
  shippingCost: shipping,
  platformFeePct: arg("platform-fee") ?? 0,
  refundRatePct: arg("refund-rate") ?? 0.05,
  otherPerOrder: 0.5,
});
console.table(ue);
const gates = checkMarginGates(ue);
console.log(gates.pass ? "PASSES margin gates" : `FAILS margin gates:\n - ${gates.failures.join("\n - ")}`);
console.log(`Suggested price from landed cost: $${suggestPrice(cogs + shipping)} | product test budget ~ $${Math.round(ue.breakevenCpa * 6)}`);
