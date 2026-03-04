const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // 1) Save to Supabase
    const { error: insertError } = await supabase.from('bar_signups').insert([clean]);

    if (insertError) {
      const msg = String(insertError.message || '').toLowerCase();

      const isDuplicate =
        msg.includes('duplicate key value') ||
        msg.includes('already exists') ||
        msg.includes('unique constraint') ||
        msg.includes('bar_signups_unique');

      if (!isDuplicate) {
        return res.status(500).json({
          step: 'supabase_insert',
          error: insertError.message,
        });
      }

      // Duplicate: succeed, don’t spam emails
      return res.status(200).json({
        ok: true,
        duplicate: true,
        message: "✅ We already have your submission — we’ll follow up soon.",
      });
    }

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const alertEmail = process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

// 2) Confirmation email to bar
const confirm = await resend.emails.send({
  from: fromEmail,
  to: clean.bar_email,
  subject: 'Dollar Bar Club — Submission Received',
  html: `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <p>Thanks — we got your submission for <strong>${clean.bar_name}</strong>.</p>
      <p>We’ll follow up shortly.</p>
    </div>
  `,
});

console.log('RESEND confirm result:', confirm);

if (confirm?.error) {
  console.log('RESEND confirm error:', confirm.error);
  return res.status(500).json({ step: 'resend_confirm', error: String(confirm.error) });
}

// 3) Notification email to Dollar Bar Club
const alert = await resend.emails.send({
  from: fromEmail,
  to: alertEmail,
  subject: `🚨 New Bar Signup: ${clean.bar_name}`,
  html: `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <h2 style="color:#16a34a;margin:0 0 10px;">New Bar Signup Submitted</h2>
      <p><strong>Bar Name:</strong><br>${clean.bar_name}</p>
      <p><strong>Manager Name:</strong><br>${clean.manager_name}</p>
      <p><strong>Contact Phone:</strong><br>${clean.bar_phone}</p>
      <p><strong>Email:</strong><br>${clean.bar_email}</p>
      <hr style="margin:20px 0;" />
      <p style="font-size:12px;color:#555;">Submitted at: ${new Date().toLocaleString()}</p>
    </div>
  `,
});

console.log('RESEND alert result:', alert);

if (alert?.error) {
  console.log('RESEND alert error:', alert.error);
  return res.status(500).json({ step: 'resend_alert', error: String(alert.error) });
}

    if (alert?.error) {
      return res.status(500).json({ step: 'resend_alert', error: String(alert.error) });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      step: 'catch',
      error: err && err.message ? err.message : String(err),
    });
  }
};
