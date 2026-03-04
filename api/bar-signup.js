import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { barName, managerName, barPhone, barEmail } = req.body || {};
    if (!barName || !managerName || !barPhone || !barEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ---- Step A: sanity check env vars (don’t print secrets)
    const envCheck = {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasResendKey: !!process.env.RESEND_API_KEY,
      fromEmail: process.env.FROM_EMAIL || null,
      alertEmail: process.env.BAR_ALERT_EMAIL || null,
    };

    // ---- Step B: Supabase insert
    const { error: insertError } = await supabase.from('bar_signups').insert([{
      bar_name: barName.trim(),
      manager_name: managerName.trim(),
      bar_phone: barPhone.trim(),
      bar_email: barEmail.trim(),
    }]);

    if (insertError) {
      return res.status(500).json({
        step: 'supabase_insert',
        envCheck,
        error: insertError.message,
      });
    }

    // ---- Step C: Emails
    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const alertEmail = process.env.BAR_ALERT_EMAIL || 'dollarbarclub@gmail.com';

    // C1 confirmation to bar
    const confirmResult = await resend.emails.send({
      from: fromEmail,
      to: barEmail.trim(),
      subject: 'Dollar Bar Club — Submission Received',
      html: `<p>Thanks! We got your submission for <strong>${barName.trim()}</strong>.</p>`,
    });

    if (confirmResult?.error) {
      return res.status(500).json({
        step: 'resend_confirm',
        envCheck,
        error: confirmResult.error,
      });
    }

    // C2 alert to you
    const alertResult = await resend.emails.send({
      from: fromEmail,
      to: alertEmail,
      subject: 'New Bar Signup — Dollar Bar Club',
      html: `
        <p><strong>Bar:</strong> ${barName.trim()}</p>
        <p><strong>Manager:</strong> ${managerName.trim()}</p>
        <p><strong>Phone:</strong> ${barPhone.trim()}</p>
        <p><strong>Email:</strong> ${barEmail.trim()}</p>
      `,
    });

    if (alertResult?.error) {
      return res.status(500).json({
        step: 'resend_alert',
        envCheck,
        error: alertResult.error,
      });
    }

    return res.status(200).json({ ok: true, envCheck });
  } catch (err) {
    return res.status(500).json({
      step: 'catch',
      error: err?.message || String(err),
    });
  }
}
