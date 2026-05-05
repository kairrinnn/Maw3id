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

interface DayState {
  closed: boolean
  open_time: string
  close_time: string
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

function initRows(schedules: ScheduleRow[]): Record<number, DayState> {
  const result: Record<number, DayState> = {}
  for (const day of DISPLAY_ORDER) {
    const s = schedules.find(r => r.day_of_week === day)
    result[day] = {
      closed: s?.closed ?? (day === 0),
      open_time: s?.open_time ?? '09:00',
      close_time: s?.close_time ?? '18:00',
    }
  }
  return result
}

export function ScheduleForm({ schedules }: Props) {
  const [state, formAction, pending] = useActionState(saveSchedules, null)
  const [rows, setRows] = useState<Record<number, DayState>>(() => initRows(schedules))
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      setFlash('Horaires enregistrés.')
      const timer = setTimeout(() => setFlash(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

  function update(day: number, patch: Partial<DayState>) {
    setRows(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }

  return (
    <form action={formAction}>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {DISPLAY_ORDER.map(day => {
          const row = rows[day]
          return (
            <div
              key={day}
              className={`flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 min-h-[48px]${row.closed ? ' bg-gray-50' : ''}`}
            >
              <span className={`text-sm font-semibold w-28 shrink-0${row.closed ? ' text-gray-400' : ' text-gray-900'}`}>
                {DAY_LABELS[day]}
              </span>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  name={`day_${day}_closed`}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={row.closed}
                  onChange={e => update(day, { closed: e.target.checked })}
                />
                <span className="text-sm text-gray-600 ml-2">Fermé</span>
              </label>

              <input
                type="time"
                name={`day_${day}_open_time`}
                className={`rounded-md border border-gray-300 px-2 py-1 text-sm w-28 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500${row.closed ? ' invisible' : ''}`}
                value={row.open_time}
                onChange={e => update(day, { open_time: e.target.value })}
              />
              <span className={`text-sm text-gray-500${row.closed ? ' invisible' : ''}`}>à</span>
              <input
                type="time"
                name={`day_${day}_close_time`}
                className={`rounded-md border border-gray-300 px-2 py-1 text-sm w-28 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500${row.closed ? ' invisible' : ''}`}
                value={row.close_time}
                onChange={e => update(day, { close_time: e.target.value })}
              />
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
