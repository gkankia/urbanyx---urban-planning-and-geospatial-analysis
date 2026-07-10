// Triggered by a Supabase Database Webhook whenever a row in `deletion_requests`
// is updated. Sends a confirmation email via Resend when status = 'completed'.

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Optional: verify a shared secret set in the webhook header
  const webhookSecret = Deno.env.get('DELETION_WEBHOOK_SECRET')
  if (webhookSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${webhookSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const payload = await req.json()

  // Supabase DB webhooks send { type, table, record, old_record, schema }
  const record = payload?.record
  if (!record || record.status !== 'completed') {
    return new Response('Not a completion event — skipped', { status: 200 })
  }

  const email: string | undefined = record.email
  if (!email) {
    console.warn('[deletion-confirmed] No email on record — skipping')
    return new Response('No email', { status: 200 })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[deletion-confirmed] RESEND_API_KEY not set')
    return new Response('Email service not configured', { status: 500 })
  }

  const fromAddress = Deno.env.get('EMAIL_FROM') ?? 'Urbanyx <noreply@urbanyx.com>'
  const appName = 'Urbanyx'

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#18181f;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 32px">
        <tr><td>
          <p style="margin:0 0 24px;font-size:1.1rem;font-weight:700;color:#ffffff">${appName}</p>
          <h1 style="margin:0 0 12px;font-size:1.3rem;font-weight:700;color:#ffffff">Your account has been deleted</h1>
          <p style="margin:0 0 20px;font-size:0.9rem;color:rgba(255,255,255,0.5);line-height:1.6">
            Hi,<br><br>
            We're writing to confirm that your ${appName} account and all associated data have been permanently deleted, as requested.
          </p>
          <p style="margin:0 0 20px;font-size:0.9rem;color:rgba(255,255,255,0.5);line-height:1.6">
            If you didn't request this or believe this was done in error, please contact us immediately at
            <a href="mailto:support@zaxis.ge" style="color:#a5b4fc;text-decoration:none">support@zaxis.ge</a>.
          </p>
          <p style="margin:0;font-size:0.82rem;color:rgba(255,255,255,0.25);line-height:1.6">
            Thank you for using ${appName}.<br>
            — The Z.axis team
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [email],
      subject: `Your ${appName} account has been deleted`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[deletion-confirmed] Resend error:', err)
    return new Response(JSON.stringify({ error: err }), { status: res.status })
  }

  console.log(`[deletion-confirmed] Confirmation email sent to ${email}`)
  return new Response(JSON.stringify({ sent: true }), { status: 200 })
})
