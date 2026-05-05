'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const DayRowSchema = z.object({
  day_of_week: z.coerce.number().int().min(0).max(6),
  open_time: z.string().regex(TIME_RE, 'Heure invalide'),
  close_time: z.string().regex(TIME_RE, 'Heure invalide'),
  closed: z.coerce.boolean(),
})

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

type ActionResult = { error: string } | { success: true }

export async function saveSchedules(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as Record<string, unknown> | null
  const tenantId = (claims?.tenant_id ?? null) as string | null
  if (!tenantId) return { error: 'Non autorisé' }

  const rows: Array<{
    tenant_id: string
    day_of_week: number
    open_time: string
    close_time: string
    closed: boolean
  }> = []

  for (let day = 0; day <= 6; day++) {
    const closedRaw = formData.get(`day_${day}_closed`)
    const openTime = (formData.get(`day_${day}_open_time`) as string) || '09:00'
    const closeTime = (formData.get(`day_${day}_close_time`) as string) || '18:00'
    const closed = closedRaw === 'on' || closedRaw === 'true' || closedRaw === '1'

    const parsed = DayRowSchema.safeParse({
      day_of_week: day,
      open_time: openTime,
      close_time: closeTime,
      closed,
    })
    if (!parsed.success) {
      return { error: `Horaires invalides pour ${DAY_LABELS[day]}` }
    }

    if (!closed && parsed.data.open_time >= parsed.data.close_time) {
      return { error: `L'heure d'ouverture doit précéder l'heure de fermeture pour ${DAY_LABELS[day]}` }
    }

    rows.push({
      tenant_id: tenantId,
      day_of_week: day,
      open_time: parsed.data.open_time,
      close_time: parsed.data.close_time,
      closed: parsed.data.closed,
    })
  }

  const { error } = await supabase
    .from('schedules')
    .upsert(rows, { onConflict: 'tenant_id,day_of_week' })

  if (error) return { error: error.message }
  revalidatePath('/schedules')
  return { success: true }
}
