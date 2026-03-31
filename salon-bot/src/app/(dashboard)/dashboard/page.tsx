import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">{tenantName}</h2>
      <div className="mt-4 rounded-lg border bg-white p-6">
        <h3 className="text-lg font-medium text-gray-800">Statut du bot</h3>
        <p className="mt-2 text-sm text-gray-600">
          {botActive ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Actif
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
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
    </div>
  )
}
