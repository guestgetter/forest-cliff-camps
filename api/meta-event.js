const crypto = require('crypto');

const PIXEL_ID = '841367735547546';
const API_VERSION = 'v21.0';

/**
 * SHA256 hash a value after trimming and lowercasing.
 * Returns undefined if the input is falsy.
 */
function sha256(value) {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Recursively remove keys with undefined values from an object
 * so the JSON payload stays clean.
 */
function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out;
  }
  return obj;
}

module.exports = async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', 'https://www.fccamps.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Token ──
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'CAPI token not configured' });

  // ── Parse body ──
  const {
    event_name,
    event_id,
    event_time,
    event_source_url,
    user_data = {},
    custom_data = {},
  } = req.body || {};

  // ── Validation ──
  if (!event_name) return res.status(400).json({ error: 'event_name required' });

  const resolvedEventId = event_id || crypto.randomUUID();
  const resolvedEventTime = event_time || Math.floor(Date.now() / 1000);

  // ── Build payload — hash all PII, pass fbp/fbc/IP/UA as-is ──
  const eventPayload = {
    data: [{
      event_name,
      event_time: resolvedEventTime,
      event_id: resolvedEventId,
      event_source_url: event_source_url || 'https://www.fccamps.ca/',
      action_source: 'website',
      user_data: {
        em: user_data.em ? [sha256(user_data.em)] : undefined,
        ph: user_data.ph ? [sha256(String(user_data.ph).replace(/\D/g, ''))] : undefined,
        fn: sha256(user_data.fn),
        ln: sha256(user_data.ln),
        ct: sha256(user_data.ct),
        st: sha256(user_data.st),
        country: sha256(user_data.country),
        client_ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
        client_user_agent: req.headers['user-agent'],
        fbp: user_data.fbp || undefined,
        fbc: user_data.fbc || undefined,
      },
      custom_data: Object.keys(custom_data).length > 0 ? custom_data : undefined,
    }],
  };

  // ── Send to Meta ──
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${token}`;
    const metaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean(eventPayload)),
    });

    const metaResult = await metaRes.json();

    return res.status(metaRes.ok ? 200 : 502).json({
      success: metaRes.ok,
      event_id: resolvedEventId,
      events_received: metaResult.events_received,
      ...(metaResult.error && { error: metaResult.error }),
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      event_id: resolvedEventId,
      error: err.message,
    });
  }
};
