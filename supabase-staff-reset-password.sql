-- ============================================================
-- Eightysixdegrees Punchcard — staff-assisted password reset
-- ============================================================
-- Run this AFTER supabase-staff-upgrade.sql on the same project:
-- https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - No email service required. A customer who forgot their password
--     asks the barista, who is already logged into the Staff Portal —
--     the same in-person trust model this app already uses for
--     stamping and redeeming. Staff open the customer's card (Edit
--     Customer), type a new password into the new "Reset Password"
--     field, and save.
--   - Same 8+ char / uppercase / lowercase / number requirement as
--     normal signup, enforced server-side here too.
--   - Only works for a customer who already has a row (existing
--     account) — it can't be used to create one.
-- ============================================================

create or replace function public.staff_reset_customer_password(p_token text, p_customer_id text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);

  if p_new_password is null
     or length(p_new_password) < 8
     or p_new_password !~ '[A-Z]'
     or p_new_password !~ '[a-z]'
     or p_new_password !~ '[0-9]' then
    raise exception 'weak_password';
  end if;

  update public.customers c set password_hash = crypt(p_new_password, gen_salt('bf')) where c.id = p_customer_id;

  if not found then
    raise exception 'customer_not_found';
  end if;
end;
$$;
grant execute on function public.staff_reset_customer_password(text, text, text) to anon;
