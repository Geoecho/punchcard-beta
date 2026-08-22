-- ============================================================
-- Fix: customer self-service writes (redeeming a reward, "keep in
-- wallet", changing your own avatar) were failing silently.
--
-- Verified live: direct writes to `customers` were being rejected with
-- "new row violates row-level security policy" even though the anon
-- INSERT/UPDATE/DELETE policies were supposed to exist from the very
-- first setup script. Whatever the cause, this re-asserts them
-- explicitly — safe to run even if they were already fine.
--
-- This does NOT reopen anything that was intentionally locked down —
-- direct SELECT stays blocked (reads still only go through the get_*/
-- login_customer/signup_customer/staff_* functions).
-- ============================================================

drop policy if exists "anon insert customers" on public.customers;
create policy "anon insert customers" on public.customers
  for insert to anon with check (true);

drop policy if exists "anon update customers" on public.customers;
create policy "anon update customers" on public.customers
  for update to anon using (true) with check (true);

drop policy if exists "anon delete customers" on public.customers;
create policy "anon delete customers" on public.customers
  for delete to anon using (true);

-- ============================================================
-- Staff: change your own password (Settings -> Staff -> Change
-- Password). Requires the current password to confirm it's really you.
-- ============================================================
create or replace function public.staff_change_password(p_token text, p_current_password text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  if crypt(p_current_password, v_staff.password_hash) <> v_staff.password_hash then
    raise exception 'incorrect_password';
  end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'invalid_input';
  end if;
  update public.staff_users u set password_hash = crypt(p_new_password, gen_salt('bf')) where u.id = v_staff.id;
end;
$$;
grant execute on function public.staff_change_password(text, text, text) to anon;
