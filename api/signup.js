// api/signup.js
import { createClient } from "@supabase/supabase-js";

// ===== CONFIG =====
const AUSTIN_LAT = 30.2672;   // downtown Austin approx
const AUSTIN_LNG = -97.7431;
const APPROVAL_RADIUS_MILES = 50;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RESEND_API_KEY = process.env.RESEND_API_KEY; // optional for now
const FROM_EMAIL = process.env.FROM_EMAIL || "hello@dollarbarclub.com";
const APP_DOWNLOAD_URL = process.env.APP_DOWNLOAD_URL || "https://barglance.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== HELPERS =====
function milesBetween(lat1, lon1, lat2, lon2) {
  // Haversine formula
  const toRad = (d) => (d * Math.PI) / 180;
  const R_km = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R_km * c;
  return km * 0.621371;
}

function makeInviteCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no confusing chars
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `DBC-${s}`;
}

async function sendEmail({ to, subject, html }) {
  // Email sending is optional for now. If you don't set RESEND_API_KEY, it just skips emailing.
  if (!RESEND_API_KEY) return;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Resend error:", txt);
  }
}

// ===== API HANDLER =====
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const zip = String(body.zip || "").trim();
    const locationDenied = Boolean(body.locationDenied);

    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;

    const utm = body.utm || {};
    const referrer = String(body.referrer || "");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Missing Supabase environment variables in Vercel" });
    }

    if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
    if (!zip) return res.status(400).json({ error: "ZIP required" });

    // ===== VERIFICATION RULES =====
    // If location denied -> waitlist automatically
    let verification_status = "waitlist";
    let verification_reason = "location_denied";
    let distance_miles = null;

    // If location allowed and we have coords, compute distance
    let invite_code = null;
    let invite_status = null;
    let invite_issued_at = null;

    if (!locationDenied && lat !== null && lng !== null) {
      distance_miles = milesBetween(AUSTIN_LAT, AUSTIN_LNG, lat, lng);

      if (distance_miles <= APPROVAL_RADIUS_MILES) {
        verification_status = "approved";
        verification_reason = `within_${APPROVAL_RADIUS_MILES}_miles`;
        invite_code = makeInviteCode();
        invite_status = "issued";
        invite_issued_at = new Date().toISOString();
      } else {
        verification_status = "waitlist";
        verification_reason = `outside_${APPROVAL_RADIUS_MILES}_miles`;
      }
    }

    // ===== SAVE TO SUPABASE =====
    // v1 approach: upsert by email (so repeat signups update record)
    const { data: existing } = await supabase
      .from("signups")
      .select("id, invite_code, invite_status")
      .eq("email", email)
      .maybeSingle();

    // If they already have a code, keep it (don’t generate a new one)
    if (existing?.invite_code) {
      invite_code = existing.invite_code;
      invite_status = existing.invite_status;
      invite_issued_at = null; // don't overwrite existing issued time
    }

    const payload = {
      email,
      zip,
      lat: locationDenied ? null : lat,
      lng: locationDenied ? null : lng,
      location_denied: locationDenied,
      distance_miles,
      verification_status,
      verification_reason,
      invite_code,
      invite_status,
      invite_issued_at,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
      referrer: referrer || null,
    };

    let savedRow;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("signups")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      savedRow = data;
    } else {
      const { data, error } = await supabase
        .from("signups")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      savedRow = data;
    }

    // ===== EMAIL USER (optional) =====
    if (savedRow.verification_status === "approved" && savedRow.invite_code) {
      await sendEmail({
        to: savedRow.email,
        subject: "You’re approved — your Dollar Bar Club invite code",
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
            <h2>You’re in. 🍸</h2>
            <p>Your Dollar Bar Club invite code:</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:1px">${savedRow.invite_code}</p>
            <p>Next step: open the BarGlance-powered app and enter this code to unlock Dollar Bar Club.</p>
            <p><a href="${APP_DOWNLOAD_URL}">Open / Download App</a></p>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to: savedRow.email,
        subject: "You’re on the Dollar Bar Club waitlist",
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
            <h2>You’re on the list.</h2>
            <p>We’re rolling out in batches to keep it curated. We’ll email you as soon as you’re approved.</p>
          </div>
        `,
      });
    }

    return res.status(200).json({
      ok: true,
      status: savedRow.verification_status,
      reason: savedRow.verification_reason,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
