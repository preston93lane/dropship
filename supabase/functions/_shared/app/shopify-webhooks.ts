/**
 * Shopify order webhooks -> `orders` table, so P&L uses what the store actually took in (and refunded),
 * not what ad platforms claim. Subscribe to `orders/create` and `orders/updated` (refunds arrive as
 * order updates; values are recomputed absolutely, so replays are harmless).
 * Each order becomes one row per matched product (shopify_order_id = "<order id>:<product uuid|other>").
 */
import type { Product, Repo, Row } from "../repo/types.ts";
import { loadEconomicsDefaults } from "./settings.ts";

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Shopify signs the raw body with HMAC-SHA256 (base64) in X-Shopify-Hmac-Sha256. */
export async function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string): Promise<boolean> {
  if (!secret || !hmacHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return safeEqual(btoa(bin), hmacHeader);
}

interface ShopifyLine {
  product_id?: number | string | null;
  quantity?: number;
  price?: string | number;
  total_discount?: string | number;
}
interface ShopifyRefund {
  refund_line_items?: { subtotal?: string | number; line_item?: { product_id?: number | string | null } }[];
}
export interface ShopifyOrder {
  id: number | string;
  created_at?: string;
  line_items?: ShopifyLine[];
  refunds?: ShopifyRefund[];
  fulfillment_status?: string | null;
  financial_status?: string | null;
}

const numericId = (v: unknown): string => String(v ?? "").replace(/^.*\//, "");

export async function ingestShopifyOrder(repo: Repo, order: ShopifyOrder): Promise<number> {
  const products = await repo.list<Product>("products", { limit: 5000 });
  const byShopifyId = new Map(products.filter((p) => p.shopify_product_id).map((p) => [numericId(p.shopify_product_id), p]));
  const d = await loadEconomicsDefaults(repo);

  const rows = new Map<string, Row & { revenue: number; refunded: number; cogs: number; shipping_cost: number }>();
  const rowFor = (shopifyProductId: unknown) => {
    const product = byShopifyId.get(numericId(shopifyProductId));
    const key = String(order.id) + ":" + (product?.id ?? "other");
    let row = rows.get(key);
    if (!row) {
      row = {
        shopify_order_id: key,
        product_id: product?.id ?? null,
        revenue: 0,
        refunded: 0,
        cogs: 0,
        shipping_cost: 0,
        fulfillment_status: order.fulfillment_status ?? order.financial_status ?? null,
        ordered_at: order.created_at ?? new Date().toISOString(),
      };
      rows.set(key, row);
    }
    return { row, product };
  };

  for (const li of order.line_items ?? []) {
    const { row, product } = rowFor(li.product_id);
    const qty = Number(li.quantity ?? 1);
    row.revenue += Number(li.price ?? 0) * qty - Number(li.total_discount ?? 0);
    if (product?.supplier?.cogs !== undefined) {
      row.cogs += Number(product.supplier.cogs) * qty;
      row.shipping_cost += Number(product.supplier.shipping_cost ?? 0) * qty;
    }
  }
  for (const refund of order.refunds ?? []) {
    for (const rli of refund.refund_line_items ?? []) {
      rowFor(rli.line_item?.product_id).row.refunded += Number(rli.subtotal ?? 0);
    }
  }

  let first = true;
  const out: Row[] = [];
  for (const row of rows.values()) {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    out.push({
      ...row,
      revenue: r2(row.revenue),
      refunded: r2(row.refunded),
      cogs: r2(row.cogs),
      shipping_cost: r2(row.shipping_cost),
      // payment fees: percentage on every row, fixed fee once per order
      fees: r2(row.revenue * d.paymentFeePct + (first ? d.paymentFeeFixed : 0)),
    });
    first = false;
  }
  await repo.upsert("orders", out, "shopify_order_id");
  return out.length;
}
