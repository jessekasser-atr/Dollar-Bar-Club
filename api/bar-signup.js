const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { barName, managerName, barPhone, barEmail } = req.body || {};

    if (!barName || !managerName || !barPhone || !barEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const clean = {
      bar_name: String(barName).trim(),
      manager_name: String(managerName).trim(),
      bar_phone: String(barPhone).trim(),
      bar_email: String(barEmail).trim(),
    };

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const alertEmail = process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

    // 1) Save to Supabase
    let duplicate = false;
    const { error: insertError } = await supabase.from('bar_signups').insert([clean]);

    if (insertError) {
      const msg = (insertError.message || '').toLowerCase();
      duplicate =
        msg.includes('duplicate key value') ||
        msg.includes('already exists') ||
        msg.includes('unique constraint') ||
        msg.includes('bar_signups_unique');

      if (!duplicate) {
        return res.status(500).json({ step: 'supabase_insert', error: insertError.message });
      }
      // If duplicate, continue (don’t return) so emails still send
    }

    // 2) Confirmation to bar (ALWAYS)
    const confirm = await resend.emails.send({
      from: fromEmail,
      to: clean.bar_email,
      subject: duplicate
        ? 'Dollar Bar Club — Submission Already Received'
        : 'Dollar Bar Club — Submission Received',
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.6;">
          <p>Thanks — we got your submission for <strong>${clean.bar_name}</strong>.</p>
          <p>${duplicate ? "It looks like we already had this on file, but you're all set." : "We’ll follow up shortly."}</p>
          <hr style="margin:16px 0;" />
          <p style="font-size:12px;color:#555;">(This is an automated confirmation.)</p>
        </div>
      `,
    });

    if (confirm?.error) {
      return res.status(500).json({ step: 'resend_confirm', error: String(confirm.error) });
    }

    // 3) Admin email to DollarBarClub (ALWAYS — tweak if you want only new)
    const alert = await resend.emails.send({
      from: fromEmail,
      to: alertEmail,
      subject: duplicate
        ? `⚠️ Duplicate Bar Signup: ${clean.bar_name}`
        : `🚨 New Bar Signup: ${clean.bar_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.6;">
          <h2 style="color:#16a34a;">${duplicate ? 'Duplicate Bar Signup' : 'New Bar Signup Submitted'}</h2>

          <p><strong>Bar Name:</strong><br>${clean.bar_name}</p>
          <p><strong>Manager Name:</strong><br>${clean.manager_name}</p>
          <p><strong>Contact Phone:</strong><br>${clean.bar_phone}</p>
          <p><strong>Email:</strong><br>${clean.bar_email}</p>

          <hr style="margin:20px 0;" />
          <p style="font-size:12px;color:#555;">Submitted at: ${new Date().toLocaleString()}</p>
        </div>
      `,
    });

    if (alert?.error) {
      return res.status(500).json({ step: 'resend_alert', error: String(alert.error) });
    }

    return res.status(200).json({
      ok: true,
      duplicate,
      message: duplicate
        ? "✅ Already received — confirmation sent again."
        : "✅ Submitted — confirmation sent.",
    });
  } catch (err) {
    return res.status(500).json({
      step: 'catch',
      error: err && err.message ? err.message : String(err),
    });
  }
};
