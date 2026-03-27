import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { AuthStatus, MetaCampaign, Project } from '../types/campaign'

export default function CampaignActionPage() {
  const navigate = useNavigate()
  const [showCampaigns, setShowCampaigns] = useState(false)

  const { data: authStatus } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
  })

  const adAccountId = authStatus?.meta_ad_account_id

  // Fetch existing campaigns when expanded
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<MetaCampaign[]>({
    queryKey: ['meta-campaigns', adAccountId],
    queryFn: () => api.get(`/meta/campaigns/${adAccountId}`),
    enabled: showCampaigns && !!adAccountId,
  })

  // Create new empty draft project
  const createProject = useMutation({
    mutationFn: () =>
      api.post<Project>('/campaigns/', {
        name: `Nueva Campana ${new Date().toLocaleDateString('es-ES')}`,
        ad_account_id: adAccountId,
      }),
    onSuccess: (project) => {
      navigate(`/project/${project.id}/strategy`)
    },
  })

  // Import existing campaign
  const importCampaign = useMutation({
    mutationFn: (campaignId: string) =>
      api.post<{ project_id: number }>(`/meta/import-campaign/${campaignId}?ad_account_id=${adAccountId}`),
    onSuccess: (data) => {
      navigate(`/project/${data.project_id}/preview`)
    },
  })

  const STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    DELETED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      {/* Account info header */}
      {authStatus?.meta_connected && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Cuenta activa</p>
            <p className="font-medium text-gray-900">
              {authStatus.business_name || authStatus.meta_business_name || 'Meta Business'}
            </p>
            {adAccountId && (
              <p className="text-xs text-gray-400">{adAccountId}</p>
            )}
          </div>
          <Link
            to="/select-account"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Cambiar cuenta
          </Link>
        </div>
      )}

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Que deseas hacer?</h2>
        <p className="text-gray-500">Elige una opcion para comenzar</p>
      </div>

      {/* Action cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Create new campaign */}
        <button
          onClick={() => createProject.mutate()}
          disabled={createProject.isPending}
          className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-blue-300 hover:shadow-md transition-all group disabled:opacity-60"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Crear Nueva Campana</h3>
              <p className="text-sm text-gray-500 mt-1">
                Sube una estrategia y crea una nueva campana desde cero
              </p>
            </div>
            {createProject.isPending && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                Creando proyecto...
              </div>
            )}
          </div>
        </button>

        {/* Modify existing campaign */}
        <button
          onClick={() => setShowCampaigns(!showCampaigns)}
          className={`bg-white rounded-xl border p-6 text-left hover:border-purple-300 hover:shadow-md transition-all group ${
            showCampaigns ? 'border-purple-300 shadow-md' : 'border-gray-200'
          }`}
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
              <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Modificar Campana Existente</h3>
              <p className="text-sm text-gray-500 mt-1">
                Edita una campana ya desplegada en Meta
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Campaign list (expanded) */}
      {showCampaigns && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">
              Campanas en {adAccountId || 'cuenta'}
            </h3>
          </div>

          {campaignsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Cargando campanas...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">No se encontraron campanas en esta cuenta.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {campaigns.map((campaign) => {
                const statusColor = STATUS_COLORS[campaign.status] || 'bg-gray-100 text-gray-600'
                return (
                  <button
                    key={campaign.id}
                    onClick={() => importCampaign.mutate(campaign.id)}
                    disabled={importCampaign.isPending}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{campaign.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                          {campaign.status}
                        </span>
                        {campaign.objective && (
                          <span className="text-xs text-gray-400">
                            {campaign.objective.replace('OUTCOME_', '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })}
            </div>
          )}

          {importCampaign.isPending && (
            <div className="px-5 py-3 border-t border-gray-100 bg-purple-50 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
              <span className="text-sm text-purple-700">Importando campana...</span>
            </div>
          )}

          {importCampaign.isError && (
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-sm text-red-600">{(importCampaign.error as Error).message}</p>
            </div>
          )}
        </div>
      )}

      {createProject.isError && (
        <p className="text-sm text-red-600 text-center">
          {(createProject.error as Error).message}
        </p>
      )}

      {/* Link to all projects */}
      <div className="text-center pt-2">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Ver todos los proyectos
        </Link>
      </div>
    </div>
  )
}
