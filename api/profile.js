// api/profile.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Expect JSON body coming from the wizard
    const profile = req.body || {};
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'Invalid profile payload' });
    }

    // (Optional) log for debugging; replace with DB/KV if needed
    console.log('Received profile:', JSON.stringify(profile));

    // Echo back a minimal OK so the UI can confirm
    return res.status(200).json({ ok: true, receivedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Profile endpoint error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}
