// api/stats.js (dependency-free)
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    // Use Supabase PostgREST to get an exact count via Content-Range header
    const url =
      `${SUPABASE_URL}/rest/v1/signups` +
      `?select=id&verification_status=eq.waitlist&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: "Supabase error", details: text });
    }

    // Example: "0-0/123"
    const contentRange = r.headers.get("content-range") || "";
    const total = Number(contentRange.split("/")[1]) || 0;

    return res.status(200).json({ waitlistCount: total });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
