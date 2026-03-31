'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const salonName = formData.get('salon_name') as string

  // Step 1: Create auth user via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError) {
    return { error: authError.message }
  }

  if (!authData.user) {
    return { error: 'Erreur lors de la création du compte' }
  }

  // Step 2: Use service client to create tenant + tenant_user + bot_config
  // Service client bypasses RLS — needed because the new user has no tenant_id in JWT yet
  const serviceClient = createServiceClient()

  // Create slug from salon name (lowercase, remove accents, replace spaces with hyphens)
  const slug = salonName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Create tenant
  const { data: tenant, error: tenantError } = await serviceClient
    .from('tenants')
    .insert({ name: salonName, slug: `${slug}-${Date.now()}` })
    .select('id')
    .single()

  if (tenantError || !tenant) {
    return { error: 'Erreur lors de la création du salon: ' + (tenantError?.message ?? 'unknown') }
  }

  // Create tenant_user link
  const { error: linkError } = await serviceClient
    .from('tenant_users')
    .insert({ tenant_id: tenant.id, user_id: authData.user.id, role: 'admin' })

  if (linkError) {
    return { error: 'Erreur lors du lien utilisateur-salon: ' + linkError.message }
  }

  // Create default bot_config (inactive until setup complete)
  const { error: configError } = await serviceClient
    .from('bot_configs')
    .insert({ tenant_id: tenant.id, system_prompt: null, active: false })

  if (configError) {
    return { error: 'Erreur lors de la configuration bot: ' + configError.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
