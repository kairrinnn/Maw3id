'use client'

import { useActionState, useState, useEffect } from 'react'
import { saveSchedules } from '@/app/(dashboard)/schedules/actions'

interface ScheduleRow {
  id: string | null
  day_of_week: number
  open_time: string
  close_time: string
  closed: boolean
}

interface Props {
  schedules: ScheduleRow[]
}

const DAY_LABELS: Record<number, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
}

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function ScheduleForm({ schedules }: Props) {
  const [state, formAction, pending] = useActionState(saveSchedules, null)
  const [closedMap, setClosedMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {}
    schedules.forEach(s => {
      map[s.day_of_week] = s.closed
    })
    return map
  })
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      setFlash('Horaires enregistrés.')
      const timer = setTimeout(() => setFlash(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

  const scheduleByDay = Object.fromEntries(schedules.map(s => [s.day_of_week, s]))

  return (
    <form action={formAction}>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {DISPLAY_ORDER.map(day => {
          const row = scheduleByDay[day]
          const isClosed = closedMap[day] ?? false

          return (
            <div
              key={day}
              className={`flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 min-h-[48px]${isClosed ? ' bg-gray-50' : ''}`}
            >
              <span
                className={`text-sm font-semibold w-28 shrink-0${isClosed ? ' text-gray-400' : ' text-gray-900'}`}
              >
                {DAY_LABELS[day]}
              </span>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  id={`day_${day}_closed_cb`}
                  name={`day_${day}_closed`}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  defaultChecked={row?.closed ?? false}
                  onChange={e =>
                    setClosedMap(m => ({ ...m, [day]: e.target.checked }))
                  }
                />
                <span className="text-sm text-gray-600 ml-2">Fermé</span>
              </label>

              {!isClosed ? (
                <>
                  <input
                    type="time"
                    required
                    name={`day_${day}_open_time`}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm w-28 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    defaultValue={row?.open_time ?? '09:00'}
                  />
                  <span className="text-sm text-gray-500">à</span>
                  <input
                    type="time"
                    required
                    name={`day_${day}_close_time`}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm w-28 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    defaultValue={row?.close_time ?? '18:00'}
                  />
                </>
              ) : (
                <>
                  <input type="hidden" name={`day_${day}_open_time`} value="00:00" />
                  <input type="hidden" name={`day_${day}_close_time`} value="00:00" />
                </>
              )}
            </div>
          )
        })}
      </div>

      {state && 'error' in state && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}

      {flash && (
        <p className="mt-3 text-sm text-green-800 bg-green-100 px-3 py-2 rounded">
          {flash}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Enregistrement...' : 'Enregistrer les horaires'}
      </button>
    </form>
  )
}
