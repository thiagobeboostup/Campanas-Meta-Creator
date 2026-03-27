import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import TargetingDisplay from '../components/TargetingDisplay'

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['preview', id],
    queryFn: () => api.get<any>(`/preview/${id}`),
  })

  if (isLoading) return <div className="text-center py-16 text-gray-500">Generando preview...</div>
  if (error) return <div className="text-center py-16 text-red-500">Error: {(error as Error).message}</div>
  if (!preview) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">&larr;</button>
          <h2 className="text-2xl font-bold text-gray-900">Preview de Campana</h2>
        </div>
        <button
          onClick={() => navigate(`/project/${id}/deploy`)}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          Desplegar a Meta
        </button>
      </div>

      {/* Campaign header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {preview.campaign.generated_name}
          </h3>
          <div className="flex gap-2 text-sm">
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
              {preview.campaign.objective?.replace('OUTCOME_', '')}
            </span>
            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
              {preview.campaign.budget_type}
            </span>
            {preview.campaign.daily_budget && (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                {preview.campaign.daily_budget} EUR/dia
              </span>
            )}
          </div>
        </div>

        {/* UTM Parameters */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">UTM Parameters</h4>
          <div className="space-y-1">
            {preview.utm_params?.map((param: any) => (
              <div key={param.name} className="flex items-center gap-2 text-sm">
                <code className="bg-gray-200 px-1.5 py-0.5 rounded text-gray-700">{param.name}</code>
                <span className="text-gray-400">=</span>
                <code className={`px-1.5 py-0.5 rounded ${
                  param.dynamic ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-200 text-gray-700'
                }`}>
                  {param.value}
                </code>
                {param.dynamic && <span className="text-xs text-yellow-600">(dinamico)</span>}
              </div>
            ))}
          </div>
          {preview.utm_preview_url && (
            <p className="mt-2 text-xs text-gray-500 break-all">
              Ejemplo: {preview.utm_preview_url}
            </p>
          )}
        </div>
      </div>

      {/* Ad Sets */}
      {preview.ad_sets?.map((adset: any) => (
        <div key={adset.id} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{adset.generated_name || adset.name}</h3>
              <p className="text-sm text-gray-500">{adset.name}</p>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">
                {adset.optimization_goal?.replace('OFFSITE_', '')}
              </span>
              {adset.budget && (
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                  {adset.budget} EUR/dia
                </span>
              )}
            </div>
          </div>

          {/* Targeting */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Targeting</h4>
            <TargetingDisplay targeting={adset.targeting} />
          </div>

          {/* Ads */}
          <div className="space-y-3">
            {adset.ads?.map((ad: any) => (
              <div key={ad.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{ad.generated_name || ad.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Creativo: {ad.creative_ref}</p>
                  </div>
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs">{ad.cta}</span>
                </div>
                {ad.headline && (
                  <p className="mt-2 text-sm font-medium text-gray-700">{ad.headline}</p>
                )}
                {ad.primary_text && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{ad.primary_text}</p>
                )}
                {ad.creative_warnings?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {ad.creative_warnings.map((w: string, i: number) => (
                      <p key={i} className="text-xs text-amber-600">&#9888; {w}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Warnings */}
      {preview.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">Advertencias ({preview.warnings.length})</h4>
          <ul className="space-y-1">
            {[...new Set(preview.warnings)].map((w: any, i: number) => (
              <li key={i} className="text-sm text-amber-700">&#9888; {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
