// Eightysixdegrees Punchcard — push notification sender
// ============================================================
// The only server-side compute this project has (everything else is a
// static PWA talking directly to Supabase). Actually delivering a Web
// Push notification requires signing it with the VAPID private key,
// which can never live in client-side code — this function is that
// one necessary trusted step.
//
// It never talks to the customers table directly and holds no elevated
// Supabase credentials — it calls the same staff-token-gated RPCs
// (supabase-push-notifications.sql) that any other staff action uses,
// so the authorization boundary is enforced in the database either way,
// consistent with the rest of this app.
//
// Called with either:
//   { staffToken, customerId, title, body, url }  — one customer's reward
//   { staffToken, broadcast: true, title, body, url } — campaign blast
// ============================================================

const webpush = require('web-push');

const SUPABASE_URL = 'https://edunsrtcdhnpbsipalhc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eBMuMX2di-IB74UsVk9rTQ_lcvNyPCv';
const VAPID_PUBLIC_KEY = 'BFab1o_b_UHZufxv0_ITw8avQ880_qs0ANokCv-3PTNWcluiqotxPurRbVCDt8k3iqG1Q1X69ZMHsHgOAiXHN9c';

webpush.setVapidDetails(
  'mailto:hbristikusicloud@gmail.com',
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function callRpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  return { ok: res.ok, status: res.status, data, raw: text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: 'vapid_not_configured' });
    return;
  }

  const { staffToken, customerId, broadcast, title, body, url } = req.body || {};

  if (!staffToken || !title || !body || (!customerId && !broadcast)) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const rpcResult = broadcast
    ? await callRpc('staff_get_all_push_subscriptions', { p_token: staffToken })
    : await callRpc('staff_get_push_subscriptions', { p_token: staffToken, p_customer_id: customerId });

  if (!rpcResult.ok) {
    // staff_from_token() raises 'unauthorized' as a Postgres exception,
    // which PostgREST surfaces as 400 — map that specifically to 401 so
    // the client can tell "bad/expired session" apart from other errors.
    const isAuthError = rpcResult.status === 400 && /unauthorized/i.test(rpcResult.raw || '');
    res.status(isAuthError ? 401 : 502).json({ error: isAuthError ? 'unauthorized' : 'upstream_error' });
    return;
  }

  const subs = Array.isArray(rpcResult.data) ? rpcResult.data : [];
  if (!subs.length) {
    res.status(200).json({ sent: 0, total: 0 });
    return;
  }

  const payload = JSON.stringify({ title, body, url: url || './' });

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload
    ))
  );

  let sent = 0;
  const staleEndpoints = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++;
    } else if (r.reason && (r.reason.statusCode === 404 || r.reason.statusCode === 410)) {
      // Push service says this subscription is gone for good (expired or
      // the customer revoked/uninstalled) — prune it so future sends
      // don't keep paying for a doomed request.
      staleEndpoints.push(subs[i].endpoint);
    }
  });

  if (staleEndpoints.length) {
    Promise.allSettled(
      staleEndpoints.map(endpoint => callRpc('remove_stale_push_subscription', { p_endpoint: endpoint }))
    ).catch(() => {});
  }

  res.status(200).json({ sent, total: subs.length });
};
