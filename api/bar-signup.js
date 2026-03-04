import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barName, managerName, barPhone, barEmail } = req.body || {};

    if (!barName || !managerName || !barPhone || !barEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1️⃣ Save to Supabase
    const { error: insertError } = await supabase
      .from('bar_signups')
      .insert([
        {
          bar_name: barName.trim(),
          manager_name: managerName.trim(),
          bar_phone: barPhone.trim(),
          bar_email: barEmail.trim(),
        },
      ]);

    // If duplicate submission, don't fail the user
    if (insertError && !insertError.message.includes('duplicate')) {
      console.error(insertError);
      return res.status(500).json({ error: insertError.message });
    }

    const fromEmail =
      process.env.FROM_EMAIL || 'Dollar Bar Club <onboarding@resend.dev>';

    const alertEmail =
      process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

    // 2️⃣ Confirmation Email to Bar
    await resend.emails.send({
      from: fromEmail,
      to: barEmail.trim(),
      subject: 'Dollar Bar Club — Submission Received',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Thanks for reaching out 🍻</h2>
          <p>Hi ${managerName.trim()},</p>
          <p>
            We received your submission for <strong>${barName.trim()}</strong>.
            Our team will review and follow up shortly.
          </p>
          <p style="margin-top:20px;">— Dollar Bar Club</p>
        </div>
      `,
    });

    // 3️⃣ Notification Email to You
    await resend.emails.send({
      from: fromEmail,
      to: alertEmail,
      subject: 'New Bar Signup — Dollar Bar Club',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>New Bar Signup 🍸</h2>
          <p><strong>Bar:</strong> ${barName.trim()}</p>
          <p><strong>Manager:</strong> ${managerName.trim()}</p>
          <p><strong>Phone:</strong> ${barPhone.trim()}</p>
          <p><strong>Email:</strong> ${barEmail.trim()}</p>
        </div>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
