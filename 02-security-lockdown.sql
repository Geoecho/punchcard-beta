-- ============================================================
-- Eightysixdegrees Punchcard — Supabase security lockdown
-- ============================================================
-- WHY THIS EXISTS:
-- The app talks to the `customers` table directly from the browser
-- using the public anon key. That key is *meant* to be public, but
-- with no restrictions on it, that currently means anyone, anywhere,
-- with no login and no visit to your shop, can send one request and
-- download every customer's name, phone/username, and stamp count.
-- This was confirmed live (read-only, non-destructive) on 2026-08-17.
--
-- SCOPE OF THIS FIX:
-- This closes that one hole — the ability to remotely dump the whole
-- customer list — with a small, low-risk change. It does NOT touch
-- how stamps/redemptions are written. Those already rely on a human
-- (your barista) glancing at the customer's phone before handing over
-- a coffee, the same trust model as a paper punch card — a customer
-- tampering with their own local stamp count doesn't get them
-- anything without a human handing them a drink. Locking that down
-- further would mean rewriting the stamping/redeem/QR flows, which
-- is a bigger, separate job — ask Claude if you want to go there next.
--
-- WHAT CHANGES:
--   - Direct reads of the `customers` table are revoked entirely.
--   - Three narrow functions replace them:
--       get_customer_by_id(id)      -> single row, for QR scan / session restore
--       get_customer_by_phone(text) -> single row, for login / "Find My Card"
--       staff_list_customers(pin)   -> full list, ONLY with the correct staff PIN
--   - Writes (signup, add stamp, redeem, edit, delete) are UNCHANGED —
--     same as today, not more or less open than before this script.
--
-- CAVEAT: staff_list_customers checks the PIN inside the database, but
-- the PIN itself still lives in your public app.js. This stops casual
-- scraping/bots (the realistic threat for a small shop), not someone
-- who deliberately reads your source code. Real staff authentication
-- would require an actual login system — a bigger change than this.
--
-- HOW TO RUN:
-- 1. Open your Supabase project -> SQL Editor.
-- 2. Paste this whole file and run it once.
-- 3. Tell Claude when it's done so the matching app.js update can ship
--    together with it (the old direct-read calls stop working the
--    moment you run this).
-- ============================================================

revoke select on public.customers from anon, authenticated;

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

-- ============================================================
-- After this, live "instant" realtime stamp updates on a customer's
-- own card may stop pushing (Supabase Realtime's row broadcasts key
-- off the same read grant this script revokes). That's fine — the
-- app already polls every 3 seconds as a fallback, so customers still
-- see new stamps within a few seconds instead of instantly, and
-- nothing breaks. Everything else keeps working once app.js is
-- updated to call these three functions instead of querying the
-- table directly for reads.
-- ============================================================
