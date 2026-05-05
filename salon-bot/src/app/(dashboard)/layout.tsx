import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/dashboard/DashboardNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect('/login')
  }

  // Redirect root / to /dashboard


  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <h1 className="text-xl font-semibold text-gray-900">Salon Bot</h1>
          <DashboardNav />
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
