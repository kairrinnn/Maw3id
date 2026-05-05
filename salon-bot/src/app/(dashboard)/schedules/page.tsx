import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ScheduleForm } from '@/components/dashboard/ScheduleForm'

const DAY_DEFAULT = (day: number) => ({
  id: null as string | null,
  day_of_week: day,
  open_time: '09:00',
  close_time: '18:00',
  closed: day === 0, // Sunday closed by default
})

export default async function SchedulesPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    redirect('/login')
  }

  const claims = claimsData.claims as Record<string, unknown>
  const tenantId = claims.tenant_id as string | null

  if (!tenantId) {
    return (
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
          Horaires d&apos;ouverture
        </h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Votre compte n&apos;est lié à aucun salon. Contactez l&apos;administrateur.
        </div>
      </div>
    )
  }

  const { data: rows } = await supabase
    .from('schedules')
    .select('id, day_of_week, open_time, close_time, closed')
    .eq('tenant_id', tenantId)
    .order('day_of_week')

  const schedules = Array.from({ length: 7 }, (_, day) => {
    const existing = (rows ?? []).find(r => r.day_of_week === day)
    if (!existing) return DAY_DEFAULT(day)
    return {
      id: existing.id,
      day_of_week: existing.day_of_week,
      open_time: existing.open_time.slice(0, 5),
      close_time: existing.close_time.slice(0, 5),
      closed: existing.closed,
    }
  })

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">
        Horaires d&apos;ouverture
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Définissez vos horaires pour chaque jour de la semaine.
      </p>
      <ScheduleForm schedules={schedules} />
    </div>
  )
}
