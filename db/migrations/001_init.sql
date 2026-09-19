-- Vitrina AI initial schema.
-- Run in the Supabase SQL editor of the `vitrina` project.

create type card_type as enum ('main', 'lifestyle', 'model', 'infographic');
create type job_status as enum ('pending', 'running', 'done', 'failed');
create type pack_code as enum ('p1', 'p5', 'p20');
create type pay_provider as enum ('click', 'stars');
create type order_status as enum ('pending', 'paid', 'failed', 'canceled');

create table users (
  tg_id          bigint primary key,
  lang           text not null default 'ru' check (lang in ('uz', 'ru')),
  credits        integer not null default 0 check (credits >= 0),
  free_card_used boolean not null default false,
  username       text,
  created_at     timestamptz not null default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  tg_id       bigint not null references users (tg_id) on delete cascade,
  title       text,
  price_uzs   bigint,
  bullets     text[] not null default '{}',
  category    text,
  source_path text not null,
  free        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index products_tg_id_idx on products (tg_id, created_at desc);

create table jobs (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  card               card_type not null,
  provider            text not null default 'higgsfield',
  provider_request_id text,
  status              job_status not null default 'pending',
  output_path         text,
  cost_usd            numeric(10, 5),
  error               text,
  attempts            smallint not null default 0,
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index jobs_product_idx on jobs (product_id);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  tg_id             bigint not null references users (tg_id) on delete cascade,
  pack              pack_code not null,
  credits           integer not null,
  amount_uzs        bigint not null,
  provider          pay_provider not null,
  provider_trans_id text,
  status            order_status not null default 'pending',
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);
create index orders_tg_id_idx on orders (tg_id, created_at desc);

create table ledger (
  id         uuid primary key default gen_random_uuid(),
  tg_id      bigint not null references users (tg_id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  ref_id     text not null,
  created_at timestamptz not null default now(),
  unique (reason, ref_id)
);

-- Atomic, idempotent balance change. Repeat calls with the same
-- (reason, ref_id) are no-ops and return the balance unchanged.
create or replace function apply_ledger(
  p_tg_id  bigint,
  p_delta  integer,
  p_reason text,
  p_ref_id text
) returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  perform 1 from ledger where reason = p_reason and ref_id = p_ref_id;
  if found then
    select credits into v_balance from users where tg_id = p_tg_id;
    return v_balance;
  end if;

  update users
     set credits = credits + p_delta
   where tg_id = p_tg_id
  returning credits into v_balance;

  if v_balance is null then
    raise exception 'user % not found', p_tg_id;
  end if;

  insert into ledger (tg_id, delta, reason, ref_id)
  values (p_tg_id, p_delta, p_reason, p_ref_id);

  return v_balance;
end;
$$;

-- Claims the one free card. Returns true only the first time per user.
create or replace function claim_free_card(p_tg_id bigint)
returns boolean
language sql
as $$
  with claimed as (
    update users set free_card_used = true
     where tg_id = p_tg_id and free_card_used = false
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- Service-role only; no anon access.
alter table users   enable row level security;
alter table products enable row level security;
alter table jobs    enable row level security;
alter table orders  enable row level security;
alter table ledger  enable row level security;
