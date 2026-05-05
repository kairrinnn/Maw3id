'use client'

import { useState, useEffect } from 'react'
import { useActionState } from 'react'
import type { Service } from '@/types/database'
import { ServiceForm } from './ServiceForm'
import { deleteService } from '@/app/(dashboard)/services/actions'

type ActionResult = { error: string | Record<string, string[]> } | { success: true } | null

interface ServiceListProps {
  services: Service[]
}

export function ServiceList({ services }: ServiceListProps) {
  const [editing, setEditing] = useState<Service | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [deleteState, deleteFormAction, deletePending] = useActionState<ActionResult, FormData>(
    deleteService as (prev: ActionResult, formData: FormData) => Promise<ActionResult>,
    null
  )

  useEffect(() => {
    if (deleteState && 'success' in deleteState && deleteState.success) {
      setConfirmingDeleteId(null)
      setFlashMessage('Service supprimé.')
      const timer = setTimeout(() => setFlashMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [deleteState])

  if (services.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-xl font-semibold text-gray-900">Aucun service configuré</h3>
          <p className="mt-2 text-sm text-gray-600">
            Ajoutez votre premier service ci-dessous pour que le bot puisse proposer des réservations.
          </p>
        </div>
        <ServiceForm initial={null} onSubmitted={() => setEditing(null)} />
      </>
    )
  }

  return (
    <>
      {flashMessage && (
        <p className="mb-4 text-sm text-green-800 bg-green-100 px-3 py-2 rounded">
          {flashMessage}
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-sm font-semibold text-gray-700 px-4 py-3 text-left">Nom</th>
              <th className="text-sm font-semibold text-gray-700 px-4 py-3 text-left">Durée</th>
              <th className="text-sm font-semibold text-gray-700 px-4 py-3 text-left">Prix (MAD)</th>
              <th className="text-sm font-semibold text-gray-700 px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr
                key={service.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="text-sm text-gray-900 px-4 py-3">{service.name}</td>
                <td className="text-sm text-gray-900 px-4 py-3">{service.duration_minutes} min</td>
                <td className="text-sm text-gray-900 px-4 py-3">
                  {service.price_mad === null ? '—' : `${service.price_mad} MAD`}
                </td>
                <td className="text-sm text-gray-900 px-4 py-3">
                  {confirmingDeleteId === service.id ? (
                    <span className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm text-red-600 mr-2">Supprimer ce service ?</span>
                      <form action={deleteFormAction}>
                        <input type="hidden" name="id" value={service.id} />
                        <button
                          type="submit"
                          disabled={deletePending}
                          className="text-sm font-semibold text-red-700 hover:text-red-900 min-h-[44px] px-2"
                        >
                          Oui, supprimer
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] px-2 ml-2"
                      >
                        Garder le service
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(service)
                          setConfirmingDeleteId(null)
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 font-semibold min-h-[44px] px-2"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingDeleteId(service.id)
                          setEditing(null)
                        }}
                        className="text-sm text-red-600 hover:text-red-800 font-semibold min-h-[44px] px-2 ml-2"
                      >
                        Supprimer ce service
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ServiceForm
        initial={editing}
        onSubmitted={() => setEditing(null)}
      />
    </>
  )
}
