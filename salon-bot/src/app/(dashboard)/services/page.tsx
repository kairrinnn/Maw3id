import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ServiceList } from '@/components/dashboard/ServiceList'
import type { Service } from '@/types/database'

export default async function ServicesPage() {
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
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Mes services</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Votre compte n&apos;est lié à aucun salon. Contactez l&apos;administrateur.
        </div>
      </div>
    )
  }

  const { data: services } = await supabase
    .from('services')
    .select('id, name, duration_minutes, price_mad, active')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('name')

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Mes services</h2>
      <ServiceList services={(services ?? []) as Service[]} />
    </div>
  )
}
