import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

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

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  const { target_user_id, request_id } = await req.json()
  if (!target_user_id) return new Response(JSON.stringify({ error: 'Missing target_user_id' }), { status: 400 })

  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id)
  if (deleteErr) return new Response(JSON.stringify({ error: deleteErr.message }), { status: 500 })

  if (request_id) {
    await adminClient.from('deletion_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', request_id)
  }

  return new Response(JSON.stringify({ deleted: true }), { status: 200 })
})
