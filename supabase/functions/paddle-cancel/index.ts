import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PADDLE_API_BASE = Deno.env.get('PADDLE_SANDBOX') === 'true'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Verify caller is an authenticated Supabase user
  const authHeader = req.headers.get('Authorization') ?? ''
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Fetch subscription record
  const { data: sub, error: subErr } = await adminClient
    .from('subscriptions')
    .select('paddle_subscription_id, billing_interval, current_period_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (subErr || !sub?.paddle_subscription_id) {
    return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 404 })
  }

  // Determine when to cancel:
  // - Yearly + within 30 days of start → cancel immediately (refund eligible)
  // - Everything else → end of current billing period
  const isYearly = sub.billing_interval === 'year'
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
  const daysUntilEnd = periodEnd ? (periodEnd.getTime() - Date.now()) / 86_400_000 : 999
  const yearlyRefundWindow = isYearly && daysUntilEnd >= 335 // within 30 days of annual start

  const effectiveFrom = yearlyRefundWindow ? 'immediately' : 'next_billing_period'

  const res = await fetch(`${PADDLE_API_BASE}/subscriptions/${sub.paddle_subscription_id}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('PADDLE_API_KEY') ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ effective_from: effectiveFrom }),
  })

  if (!res.ok) {
    const err = await res.text()
    return new Response(JSON.stringify({ error: err }), { status: res.status })
  }

  // If immediate → downgrade now; if next period → mark as canceling (webhook finalises it)
  await adminClient.from('subscriptions').update({
    status: effectiveFrom === 'immediately' ? 'canceled' : 'canceling',
    ...(effectiveFrom === 'immediately' ? { plan: 'free', paddle_subscription_id: null } : {}),
  }).eq('user_id', user.id)

  return new Response(JSON.stringify({ effective_from: effectiveFrom }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
