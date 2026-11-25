-- Dropship AI — operating database
-- One Postgres database is the shared "blackboard" every loop reads and writes.
-- Agents never touch it directly: they call the gateway Edge Function, which
-- uses the service role. RLS is enabled with no policies, so anon/authenticated
-- keys cannot read or write anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings: guardrails, score weights, rule config, business config, model registry
-- ---------------------------------------------------------------------------
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'system'
);

create table settings_history (
  id          bigserial primary key,
  key         text not null,
  value       jsonb not null,
  changed_by  text not null,
  reason      text,
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products and their lifecycle
-- ---------------------------------------------------------------------------
create table products (
  id                  uuid primary key default gen_random_uuid(),
  status              text not null default 'candidate' check (status in (
                        'candidate','validated','approved','rejected','parked','listing',
                        'creative_production','ready_to_test','testing','winner','scaling',
                        'refreshing','killed','retired')),
  title               text not null,
  niche               text,
  dedupe_key          text unique,            -- normalized name / supplier id to avoid re-researching
  source              text,                   -- tiktok_creative_center, meta_ad_library, amazon_ms, fastmoss, manual...
  source_urls         text[] not null default '{}',
  signals             jsonb not null default '{}',   -- raw research evidence (views, ad longevity, sales est.)
  components          jsonb not null default '{}',   -- 0-10 judgments per score component
  risk_flags          jsonb not null default '{}',
  supplier            jsonb not null default '{}',   -- {name, url, product_id, variant_ids, cogs, shipping_cost, shipping_days, warehouse_country}
  price               numeric(10,2),
  compare_at_price    numeric(10,2),
  economics           jsonb,                  -- output of unitEconomics()
  score               numeric(5,1),
  score_breakdown     jsonb,
  verdict             text,
  angles              jsonb not null default '[]',   -- marketing angles / avatars
  notes               text,
  test_budget         numeric(10,2),
  shopify_product_id  text,
  shopify_handle      text,
  tiktok_product_id   text,
  outcome             text check (outcome in ('winner','loser','inconclusive')),
  launched_at         timestamptz,
  decided_at          timestamptz,
  created_by          text not null default 'unknown',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_status_idx on products (status);

create table product_events (
  id          bigserial primary key,
  product_id  uuid not null references products(id) on delete cascade,
  from_status text,
  to_status   text not null,
  reason      text,
  actor       text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Creative production
-- ---------------------------------------------------------------------------
create table creative_briefs (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  status              text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  reason              text,                   -- initial_test | iterate_winner | refresh_fatigue | new_angles
  angles              jsonb not null default '[]',
  formats             text[] not null default '{}',  -- ugc_presenter, demo, motion_graphic, static, carousel, slideshow
  count               int not null default 4,
  parent_creative_id  uuid,
  notes               text,
  requested_by        text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index creative_briefs_status_idx on creative_briefs (status);

create table creatives (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  brief_id         uuid references creative_briefs(id),
  parent_id        uuid references creatives(id),
  status           text not null default 'in_production' check (status in (
                     'brief','in_production','in_review','approved','rejected','live','fatigued','retired')),
  format           text not null,           -- video | static | carousel
  style            text,                    -- ugc_presenter | demo | motion_graphic | hybrid | lifestyle | comparison
  aspect           text not null default '9:16',
  concept_family   text,                    -- diversity grouping (Andromeda treats near-duplicates as one)
  angle            text,
  hook_type        text,
  hook_text        text,
  script           text,
  primary_text     text,
  headline         text,
  cta              text default 'SHOP_NOW',
  asset_url        text,
  thumbnail_url    text,
  variants         jsonb not null default '{}', -- {"4:5": url, "1:1": url}
  duration_s       numeric(6,2),
  models_used      jsonb not null default '[]',
  production_cost  numeric(10,2) not null default 0,
  ai_generated     boolean not null default true,
  compliance       jsonb,                   -- {verdict, issues[], reviewer, reviewed_at}
  created_by       text not null default 'unknown',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index creatives_product_idx on creatives (product_id, status);

-- ---------------------------------------------------------------------------
-- Ads
-- ---------------------------------------------------------------------------
create table campaigns (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references products(id) on delete cascade,
  channel                text not null check (channel in ('meta','tiktok')),
  phase                  text not null default 'testing' check (phase in ('testing','scaling')),
  status                 text not null default 'paused' check (status in ('paused','active','killed','completed')),
  name                   text not null,
  external_campaign_id   text,
  external_adset_id      text,
  daily_budget           numeric(10,2) not null default 0,
  landing_url            text,
  last_budget_change_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index campaigns_status_idx on campaigns (status);

create table ads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  creative_id     uuid not null references creatives(id),
  channel         text not null,
  external_ad_id  text,
  status          text not null default 'paused' check (status in ('paused','active','killed')),
  launched_at     timestamptz,
  killed_at       timestamptz,
  kill_reason     text,
  created_at      timestamptz not null default now()
);
create index ads_campaign_idx on ads (campaign_id);

create table ad_metrics_daily (
  ad_id          uuid not null references ads(id) on delete cascade,
  date           date not null,
  spend          numeric(10,2) not null default 0,
  impressions    int not null default 0,
  clicks         int not null default 0,     -- link clicks
  add_to_carts   int not null default 0,
  checkouts      int not null default 0,
  purchases      int not null default 0,
  revenue        numeric(10,2) not null default 0,
  frequency      numeric(6,2),
  video_3s_views int,
  synced_at      timestamptz not null default now(),
  primary key (ad_id, date)
);

-- ---------------------------------------------------------------------------
-- Actions (intent queue) and rule decisions
-- ---------------------------------------------------------------------------
create table actions (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,
  payload          jsonb not null default '{}',
  rationale        text,
  requested_by     text not null,
  product_id       uuid references products(id),
  status           text not null check (status in (
                     'pending_approval','approved','rejected','executing','succeeded','failed','cancelled')),
  policy           jsonb not null,           -- {decision, reasons}
  result           jsonb,
  error            text,
  dry_run          boolean not null default true,
  idempotency_key  text unique,
  decided_by       text,
  decided_at       timestamptz,
  executed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index actions_status_idx on actions (status, created_at desc);

create table decisions (
  id          bigserial primary key,
  ad_id       uuid references ads(id) on delete cascade,
  product_id  uuid references products(id) on delete cascade,
  source      text not null default 'guardian',
  action      text not null,
  reason      text not null,
  metrics     jsonb,
  action_id   uuid references actions(id),
  created_at  timestamptz not null default now()
);
create index decisions_created_idx on decisions (created_at desc);

-- ---------------------------------------------------------------------------
-- Orders (from Shopify webhooks; optional but unlocks true P&L)
-- ---------------------------------------------------------------------------
create table orders (
  id                 uuid primary key default gen_random_uuid(),
  shopify_order_id   text unique,
  product_id         uuid references products(id),
  revenue            numeric(10,2) not null,
  cogs               numeric(10,2),
  shipping_cost      numeric(10,2),
  fees               numeric(10,2),
  refunded           numeric(10,2) not null default 0,
  fulfillment_status text,
  ordered_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The machine's own P&L, runs, reports, experiments, self-improvement
-- ---------------------------------------------------------------------------
create table agent_runs (
  id           uuid primary key default gen_random_uuid(),
  loop         text not null,              -- research | plan | create | execute | adapt | report | improve | strategy
  agent        text not null,
  session_id   text,
  status       text not null default 'running' check (status in ('running','succeeded','failed')),
  summary      text,
  llm_cost     numeric(10,4),
  media_cost   numeric(10,4),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table costs (
  id          bigserial primary key,
  date        date not null default current_date,
  category    text not null check (category in ('llm','media','research','saas','samples','ads','other')),
  vendor      text not null,
  amount      numeric(10,4) not null,
  ref         text,
  created_at  timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('daily','weekly','monthly','retro','incident')),
  period_start  date,
  period_end    date,
  title         text not null,
  body_md       text not null,
  metrics       jsonb not null default '{}',
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create table experiments (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid references products(id),
  hypothesis    text not null,
  variable      text not null,              -- hook | angle | format | price | offer | landing_page | audience
  variants      jsonb not null default '[]',
  status        text not null default 'running' check (status in ('running','concluded','abandoned')),
  result        jsonb,
  learning      text,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  concluded_at  timestamptz
);

create table proposals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('skill_edit','agent_prompt','new_skill','config','weights','model_registry','loop_schedule')),
  title       text not null,
  rationale   text not null,
  evidence    jsonb not null default '{}',
  files       jsonb not null default '[]',  -- [{path, content}] full new file contents
  eval        jsonb,                        -- before/after eval scores
  status      text not null default 'open' check (status in ('open','approved','rejected','applied')),
  created_by  text not null,
  decided_by  text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Views used by the gateway and reports
-- ---------------------------------------------------------------------------
create view v_ad_lifetime as
select a.id as ad_id, a.campaign_id, a.product_id, a.creative_id, a.channel, a.status,
       c.phase, c.daily_budget, c.last_budget_change_at, a.launched_at,
       coalesce(sum(m.spend),0)::numeric(10,2) as spend,
       coalesce(sum(m.impressions),0) as impressions,
       coalesce(sum(m.clicks),0) as clicks,
       coalesce(sum(m.add_to_carts),0) as add_to_carts,
       coalesce(sum(m.purchases),0) as purchases,
       coalesce(sum(m.revenue),0)::numeric(10,2) as revenue,
       max(m.frequency) as frequency
from ads a
join campaigns c on c.id = a.campaign_id
left join ad_metrics_daily m on m.ad_id = a.id
group by a.id, c.phase, c.daily_budget, c.last_budget_change_at;

create view v_daily_pnl as
select d.date,
       coalesce((select sum(spend) from ad_metrics_daily m where m.date = d.date),0) as ad_spend,
       coalesce((select sum(revenue) from ad_metrics_daily m where m.date = d.date),0) as attributed_revenue,
       coalesce((select sum(amount) from costs c where c.date = d.date and c.category in ('llm','media','research','saas')),0) as machine_cost
from (select generate_series(current_date - 30, current_date, interval '1 day')::date as date) d;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger products_touch before update on products for each row execute function touch_updated_at();
create trigger creatives_touch before update on creatives for each row execute function touch_updated_at();
create trigger briefs_touch before update on creative_briefs for each row execute function touch_updated_at();
create trigger campaigns_touch before update on campaigns for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lock everything down: only the service role (Edge Functions) gets in.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','settings_history','products','product_events','creative_briefs','creatives',
                           'campaigns','ads','ad_metrics_daily','actions','decisions','orders','agent_runs','costs',
                           'reports','experiments','proposals']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

revoke all on v_ad_lifetime, v_daily_pnl from anon, authenticated;

-- Public bucket for creative assets (ad platforms and Shopify fetch media by URL).
insert into storage.buckets (id, name, public)
values ('creatives', 'creatives', true)
on conflict (id) do nothing;

-- Seed defaults (the gateway merges these with code defaults; humans edit via the console).
insert into settings (key, value, updated_by) values
  ('guardrails', '{"autonomyLevel":1,"killSwitch":false,"maxDailyAdSpend":100,"maxDailyBudgetPerAdSet":40,"maxBudgetIncreasePct":0.3,"maxNewTestsPerDay":2,"maxActiveTestingProducts":4,"maxAutoPriceChangePct":0.15,"maxSampleOrderCost":60,"maxSampleOrdersPerWeek":3}', 'migration'),
  ('score_weights', '{"demand":0.15,"proof":0.17,"margin":0.16,"wow":0.14,"creative_potential":0.12,"competition":0.08,"fulfillment":0.1,"trend_timing":0.08}', 'migration'),
  ('economics_defaults', '{"paymentFeePct":0.029,"paymentFeeFixed":0.3,"platformFeePct":0,"refundRatePct":0.05,"otherPerOrder":0.5,"targetProfitShare":0.3,"testBudgetMultiple":6}', 'migration')
on conflict (key) do nothing;
