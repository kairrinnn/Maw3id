'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  duration_minutes: z.coerce.number().int().positive().max(600),
  price_mad: z.union([
    z.coerce.number().nonnegative(),
    z.literal('').transform(() => null),
    z.null(),
  ]).optional().nullable(),
})

const UpdateSchema = ServiceSchema.extend({
  id: z.string().uuid(),
})

const DeleteSchema = z.object({
  id: z.string().uuid(),
})

type ActionResult = { error: string | Record<string, string[]> } | { success: true }

async function getTenantId() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as Record<string, unknown> | null
  const tenantId = (claims?.tenant_id ?? null) as string | null
  return { supabase, tenantId }
}

export async function createService(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const { supabase, tenantId } = await getTenantId()
  if (!tenantId) return { error: 'Non autorisé' }

  const parsed = ServiceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { error } = await supabase
    .from('services')
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      price_mad: parsed.data.price_mad ?? null,
    })

  if (error) return { error: error.message }
  revalidatePath('/services')
  return { success: true }
}

export async function updateService(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const { supabase, tenantId } = await getTenantId()
  if (!tenantId) return { error: 'Non autorisé' }

  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { error } = await supabase
    .from('services')
    .update({
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      price_mad: parsed.data.price_mad ?? null,
    })
    .eq('id', parsed.data.id)
    .eq('tenant_id', tenantId)

  if (error) return { error: error.message }
  revalidatePath('/services')
  return { success: true }
}

export async function deleteService(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const { supabase, tenantId } = await getTenantId()
  if (!tenantId) return { error: 'Non autorisé' }

  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'ID invalide' }

  // Soft-delete: preserve FK integrity with bookings.service_id
  const { error } = await supabase
    .from('services')
    .update({ active: false })
    .eq('id', parsed.data.id)
    .eq('tenant_id', tenantId)

  if (error) return { error: error.message }
  revalidatePath('/services')
  return { success: true }
}
