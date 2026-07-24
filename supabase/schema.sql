-- Money Recorder schema. Run this once in Supabase: SQL Editor → New query → paste → Run.

-- One row per user: all the customizable config as JSON so new settings
-- never need schema changes.
create table if not exists settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Every expense entry. Amount is always the user's own share.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(10,2) not null,
  label text not null default '',
  category text not null default '',
  account text not null default 'allowance', -- 'allowance' | 'savings'
  preset_id text,          -- set when logged via a counter
  paid_by text,            -- friend name when they fronted the bill
  fronted numeric(10,2),   -- full amount user paid when fronting a group bill
  bill_id uuid,            -- links a fronted txn to its open bill
  over_cap boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Open bills: money owed to the user from fronted group bills.
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  label text not null default '',
  owed numeric(10,2) not null,
  received numeric(10,2) not null default 0,
  waiting jsonb not null default '[]',
  paid jsonb not null default '[]',
  closed boolean not null default false,
  closed_date date,
  write_off numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Non-expense money movements. Balances and debts are derived from
-- these plus transactions, so deleting an entry self-corrects.
--   allowance_in : amount = spendable credited, to_savings = skim
--   income       : amount = total received, to_savings = part saved
--   transfer     : savings -> allowance, amount moved
--   settle_pay   : paid `who` back `amount`
--   settle_receive: received `amount` against bill_id
create table if not exists flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  kind text not null,
  amount numeric(10,2) not null,
  to_savings numeric(10,2) not null default 0,
  who text,
  bill_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_txns_user_date on transactions (user_id, date);
create index if not exists idx_bills_user on bills (user_id);
create index if not exists idx_flows_user_date on flows (user_id, date);

-- Row-level security: each user sees only their own rows.
alter table settings enable row level security;
alter table transactions enable row level security;
alter table bills enable row level security;
alter table flows enable row level security;

create policy "own settings" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bills" on bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own flows" on flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
