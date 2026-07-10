import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function verifySignature(body: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false
  const parts: Record<string, string> = Object.fromEntries(
    header.split(';').map(p => { const [k, v] = p.split('='); return [k, v] })
  )
  const ts = parts['ts'], h1 = parts['h1']
  if (!ts || !h1) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}:${body}`))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === h1
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.text()
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''

  if (!(await verifySignature(body, req.headers.get('paddle-signature'), secret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const event = JSON.parse(body)
  const data = event.data
  const userId: string | undefined = data?.custom_data?.user_id

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  switch (event.event_type) {
    case 'transaction.completed': {
      if (!userId) break
      const interval: string = data.items?.[0]?.price?.billing_cycle?.interval ?? 'month'
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan: 'pro',
        status: 'active',
        paddle_subscription_id: data.subscription_id ?? data.id ?? null,
        billing_interval: interval,
        // For subscription transactions period_end is managed by subscription.activated/updated
        ...(data.subscription_id ? {} : { current_period_end: data.billing_period?.ends_at ?? data.next_billed_at ?? null }),
        paddle_customer_id: data.customer_id ?? null,
      }, { onConflict: 'user_id' })
      if (data.custom_data?.marketing_consent !== undefined) {
        await supabase.from('profiles').update({
          marketing_consent: !!data.custom_data.marketing_consent,
        }).eq('id', userId)
      }
      break
    }

    case 'subscription.activated': {
      if (!userId) break
      const startedAt: string = data.started_at ?? data.created_at ?? new Date().toISOString()
      const interval: string = data.items?.[0]?.price?.billing_cycle?.interval ?? 'month'
      const intervalMs = interval === 'year' ? 365 * 86400000 : 30 * 86400000
      const periodEndFromStart = new Date(new Date(startedAt).getTime() + intervalMs).toISOString()
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan: 'pro',
        status: data.status ?? 'active',
        paddle_subscription_id: data.id ?? null,
        billing_interval: interval,
        current_period_end: periodEndFromStart,
        paddle_customer_id: data.customer_id ?? null,
        subscription_started_at: startedAt,
      }, { onConflict: 'user_id' })
      if (data.custom_data?.marketing_consent !== undefined) {
        await supabase.from('profiles').update({
          marketing_consent: !!data.custom_data.marketing_consent,
        }).eq('id', userId)
      }
      break
    }

    case 'subscription.updated': {
      if (!userId) break
      const periodEnd: string | null = data.current_billing_period?.ends_at ?? null
      const periodInFuture = periodEnd && new Date(periodEnd) > new Date()
      const mappedStatus = (data.status === 'canceled' && periodInFuture) ? 'canceling' : data.status

      // Don't overwrite period_end during the trial-to-active transition
      const { data: existingSub } = await supabase.from('subscriptions')
        .select('subscription_started_at, billing_interval')
        .eq('user_id', userId).single()
      const startMs = existingSub?.subscription_started_at ? new Date(existingSub.subscription_started_at).getTime() : null
      const intMs = (existingSub?.billing_interval === 'year' ? 365 : 30) * 86400000
      const inFirstPeriod = startMs && ((startMs + intMs) > Date.now())

      await supabase.from('subscriptions').update({
        status: mappedStatus,
        ...(inFirstPeriod ? {} : { current_period_end: periodEnd, paddle_subscription_id: data.id }),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)
      break
    }

    case 'subscription.canceled': {
      if (!userId) break
      // Keep pro access until period end — webhook fires again at actual end
      await supabase.from('subscriptions').update({
        status: 'canceling',
        current_period_end: data.canceled_at ?? data.current_billing_period?.ends_at ?? null,
      }).eq('user_id', userId)
      break
    }

    case 'subscription.past_due': {
      if (!userId) break
      await supabase.from('subscriptions').update({ status: 'past_due' }).eq('user_id', userId)
      break
    }

    case 'subscription.paused': {
      if (!userId) break
      await supabase.from('subscriptions').update({ status: 'paused', plan: 'free' }).eq('user_id', userId)
      break
    }
  }

  return new Response('OK', { status: 200 })
})
