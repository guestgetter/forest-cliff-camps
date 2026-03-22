/**
 * GA4 Measurement Protocol — Server-Side Event Endpoint
 *
 * Fires GA4 events server-side so they bypass ad blockers and
 * provide reliable conversion data.
 *
 * Required env vars:
 *   GA4_MEASUREMENT_ID  — e.g. "G-XXXXXXXXXX"
 *   GA4_API_SECRET      — Measurement Protocol API secret
 */
module.exports = async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', 'https://www.fccamps.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return res.status(500).json({ error: 'GA4 Measurement Protocol not configured' });
  }

  const { client_id, events } = req.body || {};

  if (!client_id || !events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'client_id and events[] required' });
  }

  // Build the MP payload
  const payload = {
    client_id,
    events: events.map(evt => ({
      name: evt.name,
      params: {
        ...evt.params,
        engagement_time_msec: evt.params?.engagement_time_msec || '100',
        session_id: evt.params?.session_id || undefined,
      },
    })),
  };

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
    const gaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // MP returns 204 on success with no body
    return res.status(gaRes.ok ? 200 : 502).json({
      success: gaRes.ok,
      status: gaRes.status,
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: err.message,
    });
  }
};
