/**
 * Human console: a single server-rendered page served by the gateway.
 * Approvals, kill switch, autonomy level, caps, improvement proposals, latest report.
 * No build step, no JS framework — forms POST back to the gateway.
 */
import type { Guardrails } from "../core/policy.ts";
import type { Row } from "../repo/types.ts";

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STYLE = `
:root{--bg:#f7f7f5;--card:#fff;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e4df;--accent:#2f5bd3;--ok:#1f8a4c;--warn:#b26b00;--bad:#c0362c}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--fg:#ececea;--muted:#9a9a94;--line:#2e2e2b;--accent:#7d9cf0;--ok:#4cc27f;--warn:#e0a040;--bad:#ef6b61}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px}
.sub{color:var(--muted);margin-bottom:18px}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:6px 6px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500;border-top:none}
pre{white-space:pre-wrap;word-break:break-word;margin:0;font:12px/1.4 ui-monospace,Menlo,monospace;color:var(--muted)}
button,select,input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:5px 9px}
button{cursor:pointer}button.ok{border-color:var(--ok);color:var(--ok)}button.bad{border-color:var(--bad);color:var(--bad)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;border:1px solid var(--line);font-size:12px}
.k{color:var(--bad);font-weight:600}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
form.inline{display:inline}`;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;

export function renderLogin(error?: string): string {
  return page(
    "Dropship Console",
    `<h1>Dropship Console</h1><p class="sub">Enter the admin key (GATEWAY_ADMIN_KEY).</p>
     ${error ? `<p class="k">${esc(error)}</p>` : ""}
     <form method="post" action="console/login" class="row"><input type="password" name="key" autocomplete="current-password" required><button>Sign in</button></form>`,
  );
}

export interface ConsoleData {
  guardrails: Guardrails;
  dryRun: boolean;
  pending: Row[];
  recentActions: Row[];
  decisions: Row[];
  proposals: Row[];
  latestReport: Row | null;
  products: Row[];
  pnl?: { contribution_source: string; totals: Record<string, number>; attribution_ratio: number | null } | null;
}

export function renderConsole(d: ConsoleData): string {
  const g = d.guardrails;
  const counts: Record<string, number> = {};
  for (const p of d.products) counts[String(p.status)] = (counts[String(p.status)] ?? 0) + 1;
  const awaitingHuman = d.products.filter((p) => p.status === "validated");

  const pending = d.pending.length
    ? `<table><tr><th>Action</th><th>Why</th><th>Payload</th><th></th></tr>${d.pending
        .map(
          (a) => `<tr><td><b>${esc(a.type)}</b><br><span class="pill">${esc(a.requested_by)}</span></td>
          <td>${esc(a.rationale)}<br><small>${esc(((a.policy as { reasons?: string[] })?.reasons ?? []).join("; "))}</small></td>
          <td><pre>${esc(JSON.stringify(a.payload, null, 1)).slice(0, 600)}</pre></td>
          <td class="row"><form class="inline" method="post" action="console/actions/${esc(a.id)}/approve"><button class="ok">Approve</button></form>
          <form class="inline" method="post" action="console/actions/${esc(a.id)}/reject"><button class="bad">Reject</button></form></td></tr>`,
        )
        .join("")}</table>`
    : `<p class="sub">Nothing waiting on you.</p>`;

  const products = awaitingHuman.length
    ? `<table><tr><th>Validated product</th><th>Score</th><th>Contribution</th><th></th></tr>${awaitingHuman
        .map(
          (p) => `<tr><td>${esc(p.title)}<br><small>${esc(p.niche)}</small></td><td>${esc(p.score)}</td>
          <td>$${esc((p.economics as { contribution?: number } | null)?.contribution ?? "?")}</td>
          <td class="row"><form class="inline" method="post" action="console/products/${esc(p.id)}/approve"><button class="ok">Launch</button></form>
          <form class="inline" method="post" action="console/products/${esc(p.id)}/reject"><button class="bad">Reject</button></form></td></tr>`,
        )
        .join("")}</table>`
    : `<p class="sub">No validated products waiting.</p>`;

  const proposals = d.proposals.length
    ? d.proposals
        .map(
          (p) => `<div style="margin-bottom:10px"><b>${esc(p.title)}</b> <span class="pill">${esc(p.kind)}</span><br>${esc(p.rationale)}
          <div class="row" style="margin-top:6px"><form class="inline" method="post" action="console/proposals/${esc(p.id)}/approve"><button class="ok">Approve</button></form>
          <form class="inline" method="post" action="console/proposals/${esc(p.id)}/reject"><button class="bad">Reject</button></form>
          <small class="sub">Approved proposals are applied with <code>npm run proposals:pull</code> and reviewed as a git diff.</small></div></div>`,
        )
        .join("")
    : `<p class="sub">No open proposals.</p>`;

  const rows = (list: Row[], cols: [string, (r: Row) => unknown][]) =>
    `<table><tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr>${list
      .map((r) => `<tr>${cols.map(([, f]) => `<td>${esc(f(r))}</td>`).join("")}</tr>`)
      .join("")}</table>`;

  return page(
    "Dropship Console",
    `<h1>Dropship Console</h1>
    <div class="sub">Autonomy <b>L${g.autonomyLevel}</b> · cap $${g.maxDailyAdSpend}/day · ${g.killSwitch ? '<span class="k">KILL SWITCH ON</span>' : "kill switch off"} · ${d.dryRun ? '<span class="pill">DRY RUN</span>' : '<span class="pill">LIVE</span>'}
    · pipeline: ${Object.entries(counts).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") || "empty"}</div>
    <div class="grid">
      <section class="card" style="grid-column:1/-1"><h2>Waiting on you (${d.pending.length})</h2>${pending}</section>
      ${d.pnl ? `<section class="card" style="grid-column:1/-1"><h2>Last 7 days <span class="pill">${esc(d.pnl.contribution_source)}</span></h2>
        <div class="row" style="gap:22px">${[["Ad spend", "ad_spend"], ["Store revenue", "store_revenue"], ["Orders", "store_orders"], ["Refunds", "refunds"], ["Contribution after ads", "contribution_after_ads"], ["Machine cost", "machine_cost"], ["Net", "net"]]
          .map(([label, k]) => `<div><div class="sub" style="margin:0">${label}</div><div style="font-size:20px;font-weight:700">${k === "store_orders" ? "" : "$"}${esc(d.pnl!.totals[k!] ?? 0)}</div></div>`).join("")}
        ${d.pnl.attribution_ratio !== null ? `<div><div class="sub" style="margin:0">Platform vs store revenue</div><div style="font-size:20px;font-weight:700">${esc(d.pnl.attribution_ratio)}x</div></div>` : ""}</div></section>` : ""}
      <section class="card"><h2>Guardrails</h2>
        <form method="post" action="console/guardrails" class="row">
          <label>Autonomy<select name="autonomyLevel">${[0, 1, 2, 3].map((l) => `<option value="${l}" ${l === g.autonomyLevel ? "selected" : ""}>L${l}</option>`).join("")}</select></label>
          <label>Max daily ad spend<input name="maxDailyAdSpend" type="number" step="1" value="${g.maxDailyAdSpend}"></label>
          <label>Max per ad set<input name="maxDailyBudgetPerAdSet" type="number" step="1" value="${g.maxDailyBudgetPerAdSet}"></label>
          <label>New tests/day<input name="maxNewTestsPerDay" type="number" value="${g.maxNewTestsPerDay}"></label>
          <label>Max testing products<input name="maxActiveTestingProducts" type="number" value="${g.maxActiveTestingProducts}"></label>
          <label>Kill switch<input type="checkbox" name="killSwitch" ${g.killSwitch ? "checked" : ""}></label>
          <button>Save</button>
        </form>
        <form method="post" action="console/guardian" style="margin-top:10px"><button>Run guardian now</button></form>
      </section>
      <section class="card"><h2>Products waiting for launch approval</h2>${products}</section>
      <section class="card"><h2>Improvement proposals</h2>${proposals}</section>
      <section class="card" style="grid-column:1/-1"><h2>Latest report</h2>${d.latestReport ? `<b>${esc(d.latestReport.title)}</b><pre>${esc(d.latestReport.body_md)}</pre>` : '<p class="sub">No reports yet.</p>'}</section>
      <section class="card"><h2>Recent actions</h2>${rows(d.recentActions, [["type", (r) => r.type], ["by", (r) => r.requested_by], ["status", (r) => r.status], ["error", (r) => r.error ?? ""]])}</section>
      <section class="card"><h2>Guardian decisions</h2>${rows(d.decisions, [["action", (r) => r.action], ["reason", (r) => r.reason], ["at", (r) => String(r.created_at ?? "").slice(5, 16)]])}</section>
    </div>`,
  );
}
