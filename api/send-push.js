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

// web-push validates/parses the private key synchronously and throws if
// it's missing or malformed — doing this at module load time would crash
// the whole function on cold start whenever the env var isn't set yet,
// before the handler's own "not configured" check ever gets a chance to
// run. Only set it up once we know there's a key to use; the handler
// checks VAPID_PRIVATE_KEY before ever reaching the code path that
// needs this to have succeeded.
if (process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:hbristikusicloud@gmail.com',
    VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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

  const { staffToken, customerId, broadcast, title, body, url, customerToken, targetCustomerId, context } = req.body || {};

  const isStaffMode = !!staffToken;
  const isCustomerMode = !isStaffMode && !!customerToken && !!targetCustomerId && !!context;

  if (!title || !body || !(isStaffMode ? (customerId || broadcast) : isCustomerMode)) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const rpcResult = isStaffMode
    ? (broadcast
        ? await callRpc('staff_get_all_push_subscriptions', { p_token: staffToken })
        : await callRpc('staff_get_push_subscriptions', { p_token: staffToken, p_customer_id: customerId }))
    : await callRpc('customer_get_friend_notify_subscriptions', { p_token: customerToken, p_target_id: targetCustomerId, p_context: context });

  if (!rpcResult.ok) {
    // staff_from_token()/customer_id_from_caller() raise as a Postgres
    // exception, which PostgREST surfaces as 400 — map auth/authorization
    // failures specifically to 401 so the client can tell "bad/expired
    // session" apart from other errors. Logged so a real delivery
    // failure (as opposed to an expected auth rejection) is diagnosable
    // via `vercel logs` instead of vanishing silently.
    const isAuthError = rpcResult.status === 400 && /unauthorized|not_authorized/i.test(rpcResult.raw || '');
    if (!isAuthError) {
      console.error('[send-push] RPC failure', { status: rpcResult.status, raw: rpcResult.raw });
    }
    res.status(isAuthError ? 401 : 502).json({ error: isAuthError ? 'unauthorized' : 'upstream_error' });
    return;
  }

  const subs = Array.isArray(rpcResult.data) ? rpcResult.data : [];
  if (!subs.length) {
    // A common real-world cause of "notifications never arrive": the
    // target simply has zero rows in push_subscriptions (client-side
    // subscribe/save never actually completed), which looks identical
    // to a silent delivery failure from the customer's side. Logged so
    // that's distinguishable from an actual webpush send failure below.
    console.error('[send-push] no subscriptions found', { mode: isStaffMode ? 'staff' : 'customer', targetCustomerId: isStaffMode ? customerId : targetCustomerId, broadcast: !!broadcast, context: context || null });
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
    } else {
      // Any other failure (bad VAPID auth, malformed key, push service
      // outage, quota, etc.) previously vanished without a trace. Log
      // enough to diagnose without leaking subscription secrets — the
      // endpoint host identifies which push service rejected it (fcm.
      // googleapis.com for Android/Chrome, web.push.apple.com for iOS).
      let endpointHost = 'unknown';
      try { endpointHost = new URL(subs[i].endpoint).host; } catch (e) {}
      const reason = r.reason || {};
      console.error('[send-push] delivery failed', {
        endpointHost,
        statusCode: reason.statusCode,
        body: reason.body,
        message: reason.message
      });
    }
  });

  if (staleEndpoints.length) {
    Promise.allSettled(
      staleEndpoints.map(endpoint => callRpc('remove_stale_push_subscription', { p_endpoint: endpoint }))
    ).catch(() => {});
  }

  res.status(200).json({ sent, total: subs.length });
};
