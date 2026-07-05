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
    case 'transaction.completed':
    case 'subscription.activated': {
      if (!userId) break
      const subId: string = data.id ?? data.subscription_id ?? ''
      const interval: string = data.items?.[0]?.price?.billing_cycle?.interval ?? 'month'
      const periodEnd: string | null = data.next_billed_at ?? data.current_billing_period?.ends_at ?? null
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan: 'pro',
        status: 'active',
        paddle_subscription_id: subId,
        billing_interval: interval,
        current_period_end: periodEnd,
        paddle_customer_id: data.customer_id ?? null,
      }, { onConflict: 'user_id' })
      break
    }

    case 'subscription.updated': {
      if (!userId) break
      await supabase.from('subscriptions').update({
        status: data.status === 'active' ? 'active' : data.status,
        current_period_end: data.current_billing_period?.ends_at ?? null,
        paddle_subscription_id: data.id,
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
