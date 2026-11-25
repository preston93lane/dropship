/**
 * Shopify Admin GraphQL adapter.
 * STATUS: implemented against Admin GraphQL (productSet / productUpdate / publishablePublish).
 * VERIFY against your pinned SHOPIFY_API_VERSION before going live (run the gateway with
 * DRY_RUN=false against a development store first).
 *
 * Products are ALWAYS created as DRAFT; publishing is a separate, policy-gated action.
 */
import { requestJson } from "./http.ts";
import type { StoreAdapter, StoreProductInput } from "./types.ts";

export interface ShopifyConfig {
  domain: string; // your-store.myshopify.com
  token: string; // Admin API access token (custom app)
  apiVersion: string; // e.g. 2026-10
  storefrontDomain?: string; // custom domain for product URLs
}

export class ShopifyAdapter implements StoreAdapter {
  private readonly cfg: ShopifyConfig;
  constructor(cfg: ShopifyConfig) {
    this.cfg = cfg;
  }

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await requestJson<{ data?: T; errors?: unknown }>(
      `https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion}/graphql.json`,
      { method: "POST", headers: { "X-Shopify-Access-Token": this.cfg.token }, json: { query, variables } },
      { label: "shopify graphql" },
    );
    if (res.errors) throw new Error(`shopify graphql errors: ${JSON.stringify(res.errors).slice(0, 1000)}`);
    const data = res.data as Record<string, { userErrors?: { field?: string[]; message: string }[] }>;
    for (const v of Object.values(data ?? {})) {
      if (v && Array.isArray(v.userErrors) && v.userErrors.length > 0) {
        throw new Error(`shopify userErrors: ${v.userErrors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ")}`);
      }
    }
    return res.data as T;
  }

  private toProductSet(input: Partial<StoreProductInput>, status?: "DRAFT" | "ACTIVE") {
    const options = input.options && input.options.length > 0 ? input.options : [{ name: "Title", values: ["Default Title"] }];
    return {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.descriptionHtml !== undefined ? { descriptionHtml: input.descriptionHtml } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.productType !== undefined ? { productType: input.productType } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.seo ? { seo: input.seo } : {}),
      ...(status ? { status } : {}),
      ...(input.variants
        ? {
            productOptions: options.map((o) => ({ name: o.name, values: o.values.map((name) => ({ name })) })),
            variants: input.variants.map((v) => ({
              optionValues: options.map((o) => ({ optionName: o.name, name: v.optionValues?.[o.name] ?? o.values[0] })),
              price: v.price.toFixed(2),
              ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice.toFixed(2) } : {}),
              ...(v.sku ? { sku: v.sku } : {}),
            })),
          }
        : {}),
      ...(input.images ? { files: input.images.map((i) => ({ originalSource: i.url, alt: i.alt ?? "", contentType: "IMAGE" })) } : {}),
    };
  }

  async createDraftProduct(input: StoreProductInput) {
    const data = await this.gql<{
      productSet: { product: { id: string; handle: string; variants: { nodes: { id: string }[] } } };
    }>(
      `mutation create($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id handle variants(first: 100) { nodes { id } } }
          userErrors { field message }
        }
      }`,
      { input: this.toProductSet(input, "DRAFT") },
    );
    const p = data.productSet.product;
    return { productId: p.id, handle: p.handle, variantIds: p.variants.nodes.map((n) => n.id) };
  }

  async updateProduct(productId: string, input: Partial<StoreProductInput>) {
    await this.gql(
      `mutation update($input: ProductSetInput!, $id: ID!) {
        productSet(input: $input, identifier: { id: $id }, synchronous: true) { product { id } userErrors { field message } }
      }`,
      { id: productId, input: this.toProductSet(input) },
    );
  }

  async setActive(productId: string, active: boolean) {
    await this.gql(
      `mutation status($product: ProductUpdateInput!) {
        productUpdate(product: $product) { product { id status } userErrors { field message } }
      }`,
      { product: { id: productId, status: active ? "ACTIVE" : "DRAFT" } },
    );
  }

  async setPrice(productId: string, price: number, compareAtPrice?: number) {
    const data = await this.gql<{ product: { variants: { nodes: { id: string }[] } } }>(
      `query v($id: ID!) { product(id: $id) { variants(first: 100) { nodes { id } } } }`,
      { id: productId },
    );
    await this.gql(
      `mutation price($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
      }`,
      {
        productId,
        variants: data.product.variants.nodes.map((n) => ({
          id: n.id,
          price: price.toFixed(2),
          ...(compareAtPrice ? { compareAtPrice: compareAtPrice.toFixed(2) } : {}),
        })),
      },
    );
  }

  async publishToChannel(productId: string, publicationId: string) {
    await this.gql(
      `mutation pub($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: productId, input: [{ publicationId }] },
    );
  }

  productUrl(handle: string): string {
    return `https://${this.cfg.storefrontDomain ?? this.cfg.domain}/products/${handle}`;
  }
}
