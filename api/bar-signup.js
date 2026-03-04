const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
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

    // Save to Supabase
    const { error } = await supabase.from('bar_signups').insert([clean]);

    if (error) {
      const msg = String(error.message || '').toLowerCase();

      if (
        msg.includes('duplicate') ||
        msg.includes('unique constraint')
      ) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
        });
      }

      return res.status(500).json({
        step: 'supabase_insert',
        error: error.message,
      });
    }

    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const alertEmail = process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

    // Confirmation to bar
    await resend.emails.send({
      from: fromEmail,
      to: clean.bar_email,
      subject: 'Dollar Bar Club — Submission Received',
      html: `
        <p>Thanks for submitting <strong>${clean.bar_name}</strong>.</p>
        <p>We’ll follow up shortly.</p>
      `,
    });

    // Alert to Dollar Bar Club
    await resend.emails.send({
      from: fromEmail,
      to: alertEmail,
      subject: `🚨 New Bar Signup: ${clean.bar_name}`,
      html: `
        <h2>New Bar Signup</h2>
        <p><strong>Bar:</strong> ${clean.bar_name}</p>
        <p><strong>Manager:</strong> ${clean.manager_name}</p>
        <p><strong>Phone:</strong> ${clean.bar_phone}</p>
        <p><strong>Email:</strong> ${clean.bar_email}</p>
      `,
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({
      step: 'catch',
      error: err.message,
    });
  }
};
