async function sendConfirmationEmail({ to, zip, fullName }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";
  const APP_DOWNLOAD_URL = process.env.APP_DOWNLOAD_URL || "https://barglance.com";

  if (!RESEND_API_KEY) return;

  const subject = "You're on the Dollar Bar Club waitlist 🍻";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin-bottom:12px;">You're on the list ✅</h2>
      <p>Hey${fullName ? ` ${fullName}` : ""},</p>
      <p>Thanks for joining the Dollar Bar Club waitlist${zip ? ` from ZIP ${zip}` : ""}.</p>
      <p>We’ll send you an invite as soon as your digital passport is ready.</p>
      <p style="margin-top:18px">
        <a href="${APP_DOWNLOAD_URL}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#22c55e;color:#000;text-decoration:none;font-weight:700">
          Open Dollar Bar Club
        </a>
      </p>
      <p style="margin-top:18px;font-size:12px;opacity:.75">
        Dollar Bar Club • Austin, TX
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Confirmation email failed: ${errorText}`);
  }
}

async function sendAdminNotificationEmail({ email, fullName, phone, zip }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

  if (!RESEND_API_KEY) return;

  const subject = "New Dollar Bar Club signup";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>New Dollar Bar Club signup</h2>
      <p><strong>Name:</strong> ${fullName || "Not provided"}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
      <p><strong>ZIP:</strong> ${zip || "Not provided"}</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: "dollarbarclub@gmail.com",
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Admin email failed: ${errorText}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const body = req.body || {};
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const zip = String(body.zip || "").trim();
    const locationDenied = Boolean(body.locationDenied);
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    if (!zip) {
      return res.status(400).json({ error: "ZIP required" });
    }

    const payload = {
      full_name: fullName,
      email,
      phone,
      zip,
      lat,
      lng,
      location_denied: locationDenied,
      created_at: new Date().toISOString(),
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/signups`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        error: "Supabase insert failed",
        details: text,
      });
    }

    sendConfirmationEmail({ to: email, zip, fullName }).catch((err) =>
      console.error("Confirmation email error:", err)
    );

    sendAdminNotificationEmail({ email, fullName, phone, zip }).catch((err) =>
      console.error("Admin notification error:", err)
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};
