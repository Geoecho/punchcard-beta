-- ============================================================
-- Eightysixdegrees Punchcard — stronger signup password requirement
-- ============================================================
-- Run this AFTER supabase-staff-upgrade.sql on the same project:
-- https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS CHANGES:
--   - signup_customer() now requires 8+ characters with at least one
--     uppercase letter, one lowercase letter, and one number — matching
--     the same rule the signup form checks live as you type. This is
--     enforced server-side too, since the client-side check alone can
--     be bypassed by calling the RPC directly.
--   - Existing accounts are unaffected — this only applies going
--     forward to new signups (login_customer is untouched).
-- ============================================================

create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_new boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_existing public.customers;
  v_new_id text;
  v_hash text;
  v_name text := coalesce(nullif(trim(p_name), ''), v_username);
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  -- A returning customer signing back in through this form doesn't need
  -- to satisfy the new-password strength rule — only actually-new
  -- accounts do.
  if found then
    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, false;
    return;
  end if;

  if p_password is null
     or length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[a-z]'
     or p_password !~ '[0-9]' then
    raise exception 'weak_password';
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash, total_stamps_earned)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash, 0);

  return query select v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, true;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;
