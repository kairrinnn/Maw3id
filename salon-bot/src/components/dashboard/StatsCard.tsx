type StatsCardProps = { period: string; value: string; subLabel: string }
export function StatsCard({ period, value, subLabel }: StatsCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm font-semibold text-gray-500">{period}</p>
      <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subLabel}</p>
    </div>
  )
}
