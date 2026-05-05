'use client'

import { useActionState, useEffect, useState } from 'react'
import { createService, updateService } from '@/app/(dashboard)/services/actions'
import type { Service } from '@/types/database'

type ActionResult = { error: string | Record<string, string[]> } | { success: true } | null

interface ServiceFormProps {
  initial: Service | null
  onSubmitted: () => void
}

export function ServiceForm({ initial, onSubmitted }: ServiceFormProps) {
  const action = initial ? updateService : createService
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action as (prev: ActionResult, formData: FormData) => Promise<ActionResult>, null)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      setFlashMessage('Service enregistré.')
      const timer = setTimeout(() => setFlashMessage(null), 3000)
      onSubmitted()
      return () => clearTimeout(timer)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const errorStr =
    state && 'error' in state && typeof state.error === 'string' ? state.error : null
  const fieldErrors =
    state && 'error' in state && typeof state.error === 'object' && state.error !== null
      ? (state.error as Record<string, string[]>)
      : null

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 mt-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-4">
        {initial ? 'Modifier le service' : 'Ajouter un service'}
      </h3>

      {errorStr && (
        <p className="mt-3 text-sm text-red-600">{errorStr}</p>
      )}

      {flashMessage && (
        <p className="mt-3 text-sm text-green-800 bg-green-100 px-3 py-2 rounded">
          {flashMessage}
        </p>
      )}

      <form key={initial?.id ?? 'add'} action={formAction}>
        {initial && (
          <input type="hidden" name="id" value={initial.id} />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="service-name" className="block text-sm font-semibold text-gray-700 mb-1">
              Nom
            </label>
            <input
              id="service-name"
              name="name"
              type="text"
              required
              defaultValue={initial?.name ?? ''}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors?.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="service-duration" className="block text-sm font-semibold text-gray-700 mb-1">
              Durée (minutes)
            </label>
            <input
              id="service-duration"
              name="duration_minutes"
              type="number"
              required
              min={1}
              max={600}
              defaultValue={initial?.duration_minutes ?? ''}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors?.duration_minutes && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.duration_minutes[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="service-price" className="block text-sm font-semibold text-gray-700 mb-1">
              Prix (MAD)
            </label>
            <input
              id="service-price"
              name="price_mad"
              type="number"
              step="0.01"
              min={0}
              defaultValue={initial?.price_mad ?? ''}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors?.price_mad && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.price_mad[0]}</p>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {pending
              ? 'Enregistrement...'
              : initial
                ? 'Enregistrer les modifications'
                : 'Ajouter un service'}
          </button>

          {initial && (
            <button
              type="button"
              onClick={() => onSubmitted()}
              className="mt-4 ml-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
