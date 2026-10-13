export async function sendEmail(email, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    console.warn('email_delivery_unavailable');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error('email_delivery_failed', { status: response.status });
    return response.ok;
  } catch (_) {
    console.error('email_delivery_failed');
    return false;
  }
}
