-- ============================================================
-- Second attempt at the customer-write RLS issue, done more
-- thoroughly this time to avoid a third round-trip.
-- ============================================================

-- 1. Explicitly grant table privileges. RLS policies only restrict
--    *which rows* an operation can touch — they don't substitute for
--    the underlying GRANT. If this was ever missing, no policy would
--    have helped, however permissive.
grant insert, update, delete on public.customers to anon, authenticated;

-- 2. Recreate the policies targeting `public` (every role) instead of
--    specifically `anon`, in case the new-style publishable key
--    doesn't map to a session with current_role = 'anon' the way a
--    classic anon JWT would.
drop policy if exists "anon insert customers" on public.customers;
create policy "public insert customers" on public.customers
  for insert to public with check (true);

drop policy if exists "anon update customers" on public.customers;
create policy "public update customers" on public.customers
  for update to public using (true) with check (true);

drop policy if exists "anon delete customers" on public.customers;
create policy "public delete customers" on public.customers
  for delete to public using (true);

-- 3. Diagnostic, in case the above still isn't enough — tells me
--    exactly which Postgres role your public key connects as, so I'm
--    not guessing a third time. Safe, read-only.
create or replace function public.diagnose_current_role()
returns table(cur_role text, cur_user text, session_user_name text)
language sql
security invoker
as $$
  select current_setting('role', true), current_user::text, session_user::text;
$$;
grant execute on function public.diagnose_current_role() to anon, authenticated, public;
