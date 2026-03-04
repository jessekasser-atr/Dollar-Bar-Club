export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barName, managerName, barPhone, barEmail } = req.body || {};

    if (!barName || !managerName || !barPhone || !barEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
