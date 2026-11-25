/**
 * Telegram control channel: one-tap approve/reject on approval requests, plus phone commands.
 *   /status   autonomy, kill switch, spend today, pipeline, pending approvals
 *   /pending  re-sends each pending approval with its buttons
 *   /pnl      last 7 days P&L
 *   /kill     emergency stop: kill switch on + pause every active campaign (risk-reducing, no confirmation)
 * Only the configured chat is obeyed; everyone else is ignored. Turning the kill switch OFF and raising
 * autonomy are deliberately console-only (they increase risk).
 */
import type { ActionRow } from "../repo/types.ts";
import { decideAction, describeAction, engageKillSwitch, HttpError, type Deps } from "./actions.ts";
import { computePnl } from "./pnl.ts";
import { buildSummary } from "./summary.ts";

export interface TelegramUpdate {
  update_id?: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
  };
  message?: { message_id: number; chat: { id: number }; text?: string };
}

const HELP = "Commands: /status · /pending · /pnl · /kill (emergency stop). Approve or reject with the buttons on each request.";

export async function handleTelegramUpdate(deps: Deps, update: TelegramUpdate): Promise<void> {
  const tg = deps.integrations.telegram;
  if (!tg) return;

  const cq = update.callback_query;
  if (cq) {
    const chatId = String(cq.message?.chat.id ?? cq.from.id);
    if (chatId !== tg.chatId) {
      await tg.answerCallback(cq.id, "Not authorized");
      return;
    }
    const m = /^(a|r):([\w-]+)$/.exec(cq.data ?? "");
    if (!m) {
      await tg.answerCallback(cq.id, "Unknown button");
      return;
    }
    let outcome: string;
    try {
      const row = await decideAction(deps, m[2]!, m[1] === "a", "human:telegram");
      outcome =
        row.status === "succeeded" ? "✅ Approved and done"
        : row.status === "rejected" ? "❌ Rejected"
        : row.status === "failed" ? "⚠️ Approved, but it failed: " + String(row.error ?? "")
        : "Status: " + row.status;
    } catch (e) {
      outcome = e instanceof HttpError && e.status === 409 ? "Already decided" : "Error: " + (e instanceof Error ? e.message : String(e));
    }
    await tg.answerCallback(cq.id, outcome);
    if (cq.message) await tg.editMessage(cq.message.chat.id, cq.message.message_id, (cq.message.text ?? "") + "\n\n" + outcome);
    return;
  }

  const msg = update.message;
  if (!msg?.text || String(msg.chat.id) !== tg.chatId) return;
  const cmd = (msg.text.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/@.*$/, "");

  if (cmd === "/status") {
    const s = await buildSummary(deps);
    const g = s.guardrails;
    const pipeline = Object.entries(s.products_by_status).map(([k, v]) => k + " " + v).join(", ") || "empty";
    await tg.sendMessage(
      "Autonomy L" + g.autonomyLevel + (g.killSwitch ? " · KILL SWITCH ON" : "") + (s.dry_run ? " · DRY RUN" : "") +
        "\nSpend today $" + s.spend_today + " / cap $" + g.maxDailyAdSpend + " · revenue $" + s.revenue_today +
        "\nActive campaigns " + s.active_campaigns + " ($" + s.committed_daily_budget + "/day committed)" +
        "\nPipeline: " + pipeline +
        "\nWaiting on you: " + s.pending_approvals + " approval(s)",
    );
    return;
  }
  if (cmd === "/pending") {
    const pending = await deps.repo.list<ActionRow>("actions", { eq: { status: "pending_approval" }, order: { column: "created_at", ascending: true }, limit: 10 });
    if (pending.length === 0) {
      await tg.sendMessage("Nothing waiting on you.");
      return;
    }
    for (const a of pending) {
      await tg.sendMessage("Approval needed: " + describeAction(a.type, a.payload) + (a.rationale ? "\nWhy: " + a.rationale : ""), [
        { text: "✅ Approve", data: "a:" + a.id },
        { text: "❌ Reject", data: "r:" + a.id },
      ]);
    }
    return;
  }
  if (cmd === "/pnl") {
    const p = await computePnl(deps.repo, deps.now(), 7);
    const t = p.totals;
    await tg.sendMessage(
      "Last 7 days (" + p.contribution_source + "):\nAd spend $" + t.ad_spend + " · store revenue $" + t.store_revenue + " (" + t.store_orders + " orders)" +
        "\nContribution after ads $" + t.contribution_after_ads + " · machine $" + t.machine_cost + "\nNET $" + t.net +
        (p.attribution_ratio !== null ? "\nPlatforms claim " + p.attribution_ratio + "x the store's revenue" : ""),
    );
    return;
  }
  if (cmd === "/kill") {
    const paused = await engageKillSwitch(deps, "human:telegram", "Telegram /kill");
    await tg.sendMessage("🛑 Kill switch ON. Paused " + paused + " campaign(s). Turn it off in the console after review.");
    return;
  }
  await tg.sendMessage(HELP);
}
