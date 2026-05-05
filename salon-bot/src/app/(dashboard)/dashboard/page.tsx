import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getWeekBoundsCasablanca, getMonthBoundsCasablanca, formatMad, sumRevenue } from '@/lib/dashboard/stats'
import { StatsCard } from '@/components/dashboard/StatsCard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    redirect('/login')
  }

  const claims = claimsData.claims as Record<string, unknown>
  const tenantId = claims.tenant_id as string | null

  let tenantName = 'Aucun salon lié'
  let botActive = false

  if (tenantId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    if (tenant) {
      tenantName = tenant.name
    }

    const { data: botConfig } = await supabase
      .from('bot_configs')
      .select('active')
      .eq('tenant_id', tenantId)
      .single()

    if (botConfig) {
      botActive = botConfig.active
    }
  }

  const now = new Date()
  const week = getWeekBoundsCasablanca(now)
  const month = getMonthBoundsCasablanca(now)

  const [weekResult, monthResult] = tenantId
    ? await Promise.all([
        supabase
          .from('bookings')
          .select('id, services(price_mad)')
          .eq('tenant_id', tenantId)
          .eq('status', 'confirmed')
          .gte('appointment_at', week.startIso)
          .lte('appointment_at', week.endIso),
        supabase
          .from('bookings')
          .select('id, services(price_mad)')
          .eq('tenant_id', tenantId)
          .eq('status', 'confirmed')
          .gte('appointment_at', month.startIso)
          .lte('appointment_at', month.endIso),
      ])
    : [{ data: [] }, { data: [] }]

  const weekBookings = weekResult.data ?? []
  const monthBookings = monthResult.data ?? []
  const weekCount = weekBookings.length
  const monthCount = monthBookings.length
  const weekRevenue = formatMad(sumRevenue(weekBookings as Array<{ services: { price_mad: number | null } | { price_mad: number | null }[] | null }>))
  const monthRevenue = formatMad(sumRevenue(monthBookings as Array<{ services: { price_mad: number | null } | { price_mad: number | null }[] | null }>))

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900">{tenantName}</h2>
      <div className="mt-4 rounded-lg border bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800">Statut du bot</h3>
        <p className="mt-2 text-sm text-gray-600">
          {botActive ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
              Actif
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">
              Inactif — Complétez la configuration
            </span>
          )}
        </p>
      </div>
      {!tenantId && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Votre compte n'est lié à aucun salon. Contactez l'administrateur.
        </div>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <StatsCard period="Cette semaine" value={String(weekCount)} subLabel="réservations confirmées" />
        <StatsCard period="Ce mois" value={String(monthCount)} subLabel="réservations confirmées" />
        <StatsCard period="Cette semaine" value={weekRevenue} subLabel="revenus estimés" />
        <StatsCard period="Ce mois" value={monthRevenue} subLabel="revenus estimés" />
      </div>
    </div>
  )
}
