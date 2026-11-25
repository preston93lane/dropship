# Weekend start plan (Nov 28-29, 2026)

The plan: **TikTok-Shop-first, organic AI videos, creator affiliates, no paid ads yet.** Budget for this phase is about
$500-1,000. Shopify, a custom domain and paid ads come later, once a product shows it sells.

Time needed: about 4-5 hours Saturday, 3-4 hours Sunday. Check items off as you go.

---

## Before the weekend (15 min, any evening)
- [ ] Decide your **monthly limit** for this phase (suggested: $150/month running costs + ~$300 one-time).
- [ ] Pick 3 **brand name** ideas for a dog-gear shop (short, easy to say, not like an existing brand). Check each is free
      as a TikTok handle and on the USPTO trademark search (tmsearch.uspto.gov).
- [ ] Have ready: government ID, a bank account for payouts, and your tax ID (SSN or EIN). TikTok Shop asks for these.
      If you want a business entity (LLC), that can come later; you can start as a sole proprietor.

---

## Saturday morning: accounts (about 2 hours)

1. **TikTok account for the brand** (not your personal one).
   - [ ] Create it with the brand handle; profile photo (AI logo is fine), bio: what you sell and who it's for.
   - [ ] **Warm it up for a few days before posting sales content:** each day, spend ~20 min watching and liking
         dog/pet videos, follow a few pet creators. New accounts that post ads immediately get little reach.
2. **TikTok Shop seller account** (seller-us.tiktok.com).
   - [ ] Sign up as a US seller, verify identity, add your bank account for payouts.
   - [ ] Note the current **referral fee and shipping rules** shown in Seller Center (write them in
         `.claude/skills/business-profile/SKILL.md` so the agents use the real numbers).
   - [ ] Link the shop to your TikTok account.
3. **Supplier account:** [ ] CJdropshipping (free). Optional second: a US-warehouse supplier you find while searching.
4. **AI accounts:** [ ] fal.ai with **$20 prepaid, auto top-up OFF**. [ ] Anthropic API key (or use Claude Code
   locally, which is all you need this phase).
5. **Telegram:** [ ] create a bot with @BotFather (2 min) for approvals and daily reports.

Never paste keys into a chat. Put them in a local `.env` file (it's git-ignored) as `docs/07-setup.md` shows.

---

## Saturday afternoon: the system, locally (about 2 hours)

- [ ] Install Node 22+ and clone the repo, then:
  ```bash
  npm ci
  npm run demo
  npm run dev:gateway
  ```
  Open http://localhost:8787/console (key `dev-admin-key`) and click around: approvals, products, P&L.
- [ ] **Fill in the business profile** (`.claude/skills/business-profile/SKILL.md`): niche = dog owners' home and travel
      gear; brand name; customer; price band $40-100; channel = TikTok Shop first; exclusions (shock/e-collars,
      health claims, anything branded or licensed); TikTok Shop fee and shipping rules from above.
- [ ] Run the research loop and read what it finds:
  ```bash
  npm run loop -- research
  ```
  Where you disagree with its picks, say why in the `product-research` skill. That's how it learns your taste.

---

## Sunday morning: products and suppliers (about 2 hours)

- [ ] In CJ (US warehouse filter), find the **fountain** and **seat extender** (and 1-2 picks from the research run).
      For each, write down: unit cost, US shipping cost and days, stock, and product photos/videos available.
- [ ] Check each against the **walk-away landed cost** (fountain ≤ $45, extender ≤ $29; see
      `docs/research/2026-11-first-products-and-forecast.md` §3). Drop anything over.
- [ ] Message the supplier for anything with a pump/plug: ask for certification documents (UL/ETL/FCC as relevant).
- [ ] Spy on the competition (free, ~30 min):
  - TikTok search "dog water fountain" / "back seat extender": save the 5 best videos; note hooks and comments.
  - Meta Ad Library (facebook.com/ads/library): search the same; ads running 30+ days = proven.
  - Read 1-3 star reviews on Amazon/Chewy for each product. Complaints = your improvement and your angle.
- [ ] **Order one sample** of each product that passed (~$40-60 each). Not for filming: to check it matches the photos.

---

## Sunday afternoon: first videos (about 1.5 hours)

- [ ] Run the creative loop for your top product:
  ```bash
  npm run loop -- create
  ```
  It makes AI videos and images from the supplier photos, plus captions and hooks, and checks them for compliance.
- [ ] Watch every video. Reject anything where the product looks different from the supplier photos, or does
      something it can't. Keep the 3-5 best.
- [ ] Don't post yet (account is warming up). Schedule posting to start **Wednesday or Thursday**.

---

## Next week (30-45 min a day)
- [ ] Keep warming the account daily; from mid-week, **post 1-3 videos a day**, varying hooks. Label AI content with
      TikTok's AI-generated toggle when it shows realistic AI scenes or people.
- [ ] When the sample arrives: check quality, then list the product in TikTok Shop (title, photos, price, shipping).
      Turn on **open affiliate collaboration** (start at 15% commission) so creators can promote it.
- [ ] Track every video: views, saves, shares, "where can I buy" comments. After ~2 weeks, the product whose
      videos get real engagement is the one we push; products that get nothing get dropped at $0 ad spend.
- [ ] Report back here what's working; I'll adjust the agents and the plan.

## Money this phase (estimate)
| Item | Cost |
|---|---|
| Samples (2-3 products) | $100-180 |
| fal.ai credits | $20-50 |
| Claude usage (local, lean) | ~$20-100/month depending on your plan |
| TikTok Shop | per-sale fees only |
| Paid ads, Shopify, domain | $0 until a product proves itself |

## Built for you next (ask me)
The system was designed for Shopify + paid ads. For this plan it still needs: an **organic posting + tracking loop**,
**TikTok Shop listing via its own API**, and **creator/affiliate outreach**. Tell me to build them, in that order.
