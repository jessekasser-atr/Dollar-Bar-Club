const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  // Handle preflight (sometimes needed)
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barName, managerName, barPhone, barEmail } = req.body || {};

    if (!barName || !managerName || !barPhone || !barEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1) Save to Supabase
    const { error: insertError } = await supabase.from('bar_signups').insert([
      {
        bar_name: String(barName).trim(),
        manager_name: String(managerName).trim(),
        bar_phone: String(barPhone).trim(),
        bar_email: String(barEmail).trim(),
      },
    ]);

    if (insertError) {
      return res.status(500).json({
        step: 'supabase_insert',
        error: insertError.message,
      });
    }

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const alertEmail = process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

    // 2) Confirmation to bar
    const confirm = await resend.emails.send({
      from: fromEmail,
      to: String(barEmail).trim(),
      subject: 'Dollar Bar Club — Submission Received',
      html: `<p>Thanks — we got your submission for <strong>${String(barName).trim()}</strong>. We’ll follow up shortly.</p>`,
    });

    if (confirm?.error) {
      return res.status(500).json({ step: 'resend_confirm', error: confirm.error });
    }

// 3) Alert to Dollar Bar Club
const alert = await resend.emails.send({
  from: fromEmail,
  to: alertEmail,
  subject: `🚨 New Bar Signup: ${String(barName).trim()}`,
  html: `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <h2 style="color:#16a34a;">New Bar Signup Submitted</h2>

      <p><strong>Bar Name:</strong><br>${String(barName).trim()}</p>

      <p><strong>Manager Name:</strong><br>${String(managerName).trim()}</p>

      <p><strong>Contact Phone:</strong><br>${String(barPhone).trim()}</p>

      <p><strong>Email:</strong><br>${String(barEmail).trim()}</p>

      <hr style="margin:20px 0;" />

      <p style="font-size:12px;color:#555;">
        Submitted at: ${new Date().toLocaleString()}
      </p>
    </div>
  `,
});

    if (alert?.error) {
      return res.status(500).json({ step: 'resend_alert', error: alert.error });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      step: 'catch',
      error: err && err.message ? err.message : String(err),
    });
  }
};
