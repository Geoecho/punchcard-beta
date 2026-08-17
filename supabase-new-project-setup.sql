-- ============================================================
-- Eightysixdegrees Punchcard — new Supabase project setup
-- Project: https://edunsrtcdhnpbsipalhc.supabase.co
-- ============================================================
-- This is for a FRESH/empty project. It creates the `customers` table
-- and locks it down the secure way from the start (no retrofitting):
--   - Reads only go through 3 narrow functions (single-row lookups,
--     plus a staff-PIN-gated full list) — no direct table reads at all.
--   - Writes (signup, add stamp, redeem, edit, delete) go through the
--     table directly, same as the app's current design — a customer's
--     own device can write their own record, and staff can write any
--     record, same trust model as a paper punch card (see note below).
--
-- If you already have data in this project and the table exists, do
-- NOT run the "create table" step — tell Claude and it'll adjust this
-- to only add the lockdown functions on top of your existing table.
--
-- HOW TO RUN: Supabase project -> SQL Editor -> paste this whole file
-- -> Run. Then tell Claude it's done so app.js/deploy can go out.
-- ============================================================

-- 1. Table
create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text default '',
  stamps integer not null default 0,
  rewards_earned integer not null default 0,
  joined_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb
);

-- 2. Enable RLS. No SELECT policy is added on purpose — all reads go
--    through the SECURITY DEFINER functions below instead, so there is
--    no direct-table-read path for anyone (public key or not).
alter table public.customers enable row level security;

-- Writes stay open to the app's anon key, matching current app.js
-- behavior (signup, stamping, redeeming, staff edits all write directly).
drop policy if exists "anon insert customers" on public.customers;
create policy "anon insert customers" on public.customers
  for insert to anon with check (true);

drop policy if exists "anon update customers" on public.customers;
create policy "anon update customers" on public.customers
  for update to anon using (true) with check (true);

drop policy if exists "anon delete customers" on public.customers;
create policy "anon delete customers" on public.customers
  for delete to anon using (true);

-- 3. Read functions (bypass RLS via SECURITY DEFINER, so they can read
--    even though there's no SELECT policy above).

create or replace function public.get_customer_by_id(p_id text)
returns setof public.customers
language sql
security definer
set search_path = public
as $$
  select * from public.customers where id = p_id limit 1;
$$;
grant execute on function public.get_customer_by_id(text) to anon;

create or replace function public.get_customer_by_phone(p_phone text)
returns setof public.customers
language sql
security definer
set search_path = public
as $$
  select * from public.customers where phone ilike ('%' || p_phone || '%') limit 1;
$$;
grant execute on function public.get_customer_by_phone(text) to anon;

create or replace function public.staff_list_customers(p_pin text)
returns setof public.customers
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin is distinct from '8686' then
    raise exception 'unauthorized';
  end if;
  return query select * from public.customers order by joined_at desc;
end;
$$;
grant execute on function public.staff_list_customers(text) to anon;

-- 4. Let Realtime broadcast row changes for this table (used for the
--    "instant" stamp update on a customer's own card; the app also
--    polls every 3s as a fallback either way, so this is optional).
alter publication supabase_realtime add table public.customers;

-- ============================================================
-- CAVEAT (same as before): staff_list_customers checks the PIN inside
-- the database, but the PIN itself still lives in your public app.js.
-- This stops casual scraping/bots, not someone who deliberately reads
-- your source. Writes (stamps/redeem) are also not cryptographically
-- verified — the barista visually checking the customer's phone is
-- the actual security boundary there today, same as a paper punch
-- card. Real staff/customer authentication would close both gaps but
-- is a bigger change than this script.
-- ============================================================
