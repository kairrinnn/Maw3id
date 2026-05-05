'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/dashboard', label: 'Tableau de bord' },
  { href: '/services', label: 'Services' },
  { href: '/schedules', label: 'Horaires' },
]

export function DashboardNav() {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-6">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href
        const className = active
          ? 'text-sm font-semibold text-gray-900 underline underline-offset-4'
          : 'text-sm text-gray-600 hover:text-gray-900'
        return <Link key={href} href={href} className={className}>{label}</Link>
      })}
    </nav>
  )
}
