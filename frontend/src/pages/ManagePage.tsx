import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Project, CreativeAnalysis } from '../types/campaign'
import TargetingDisplay from '../components/TargetingDisplay'

export default function ManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [newBudget, setNewBudget] = useState('')
  const [analysis, setAnalysis] = useState<CreativeAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [editingAd, setEditingAd] = useState<number | null>(null)
  const [editCopy, setEditCopy] = useState({ headline: '', primary_text: '', description: '' })

  const { data: project } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => api.get(`/campaigns/${id}`),
  })

  const updateBudget = useMutation({
    mutationFn: () =>
      api.put(`/manage/${id}/budget`, { daily_budget: parseFloat(newBudget) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      setNewBudget('')
    },
  })

  const toggleAdStatus = useMutation({
    mutationFn: (params: { adId: number; status: string }) =>
      api.put(`/manage/ad/${params.adId}/status`, { status: params.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const updateAdCopy = useMutation({
    mutationFn: (adId: number) =>
      api.put(`/manage/ad/${adId}/copy`, editCopy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      setEditingAd(null)
    },
  })

  const analyzeCreative = async (file: File) => {
    setIsAnalyzing(true)
    setAnalysis(null)
    try {
      const result = await api.upload<CreativeAnalysis>(
        `/manage/${id}/analyze-creative`,
        file,
      )
      setAnalysis(result)
    } catch (err) {
      alert(`Error: ${(err as Error).message}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const addAdToAdSet = useMutation({
    mutationFn: (params: { adsetId: number; creativeId: number }) =>
      api.post(`/manage/adset/${params.adsetId}/ad`, {
        name: analysis?.filename || 'New Ad',
        creative_id: params.creativeId,
        headline: '',
        primary_text: '',
        cta: 'SHOP_NOW',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      setAnalysis(null)
    },
  })

  if (!project) return <div className="text-center py-16 text-gray-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">&larr;</button>
        <h2 className="text-2xl font-bold text-gray-900">Gestionar: {project.name}</h2>
        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
          {project.status}
        </span>
        {project.meta_campaign_id && (
          <a
            href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${project.ad_account_id?.replace('act_', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
          >
            Abrir Ads Manager
          </a>
        )}
      </div>

      {/* Budget management */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Presupuesto</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Actual:</span>
          <span className="font-semibold">
            {project.daily_budget ? `${project.daily_budget} EUR/dia` : 'No definido'}
          </span>
        </div>
        <div className="flex gap-3">
          <input
            type="number"
            value={newBudget}
            onChange={(e) => setNewBudget(e.target.value)}
            placeholder="Nuevo presupuesto diario"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <button
            onClick={() => updateBudget.mutate()}
            disabled={!newBudget || updateBudget.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {updateBudget.isPending ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
        {updateBudget.isSuccess && <p className="text-sm text-green-600">Presupuesto actualizado</p>}
      </div>

      {/* Campaign structure with targeting and controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Estructura Actual</h3>
        <div className="space-y-4">
          {project.ad_sets?.map((adset) => (
            <div key={adset.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-800">{adset.generated_name || adset.name}</p>
                  <p className="text-xs text-gray-500">
                    {adset.meta_adset_id} | {adset.optimization_goal?.replace('OFFSITE_', '')}
                    {adset.budget ? ` | ${adset.budget} EUR/dia` : ''}
                  </p>
                </div>
                <span className="text-sm text-gray-500">{adset.ads?.length || 0} anuncios</span>
              </div>

              {/* Targeting */}
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <h5 className="text-xs font-medium text-gray-500 uppercase mb-1">Targeting</h5>
                <TargetingDisplay targeting={adset.targeting_json} />
              </div>

              {/* Ads */}
              <div className="space-y-2">
                {adset.ads?.map((ad) => (
                  <div key={ad.id} className="ml-2 pl-3 border-l-2 border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">
                          {ad.generated_name || ad.name}
                        </p>
                        {ad.headline && (
                          <p className="text-xs text-gray-500 mt-0.5">{ad.headline}</p>
                        )}
                        {ad.primary_text && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{ad.primary_text}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {ad.meta_ad_id && (
                          <span className="text-xs text-gray-400">{ad.meta_ad_id}</span>
                        )}
                        {/* Status toggle */}
                        {ad.meta_ad_id && (
                          <button
                            onClick={() =>
                              toggleAdStatus.mutate({
                                adId: ad.id,
                                status: ad.status === 'active' ? 'PAUSED' : 'ACTIVE',
                              })
                            }
                            disabled={toggleAdStatus.isPending}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              ad.status === 'active'
                                ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                            }`}
                          >
                            {ad.status === 'active' ? 'Pausar' : 'Activar'}
                          </button>
                        )}
                        {/* Edit copy button */}
                        <button
                          onClick={() => {
                            setEditingAd(ad.id)
                            setEditCopy({
                              headline: ad.headline || '',
                              primary_text: ad.primary_text || '',
                              description: ad.description || '',
                            })
                          }}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                        >
                          Editar
                        </button>
                      </div>
                    </div>

                    {/* Inline copy editor */}
                    {editingAd === ad.id && (
                      <div className="mt-2 bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <input
                          value={editCopy.headline}
                          onChange={(e) => setEditCopy({ ...editCopy, headline: e.target.value })}
                          placeholder="Headline"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                        />
                        <textarea
                          value={editCopy.primary_text}
                          onChange={(e) => setEditCopy({ ...editCopy, primary_text: e.target.value })}
                          placeholder="Primary text"
                          rows={2}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                        />
                        <input
                          value={editCopy.description}
                          onChange={(e) => setEditCopy({ ...editCopy, description: e.target.value })}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateAdCopy.mutate(ad.id)}
                            disabled={updateAdCopy.isPending}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                          >
                            {updateAdCopy.isPending ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            onClick={() => setEditingAd(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyze new creative */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Anadir Nuevo Creativo</h3>
        <p className="text-sm text-gray-600">
          Sube un nuevo creativo y la IA analizara en que ad set encaja mejor.
        </p>

        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) analyzeCreative(file)
          }}
          className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700"
        />

        {isAnalyzing && (
          <div className="flex items-center gap-3 text-sm text-purple-600 animate-pulse">
            Analizando creativo con IA...
          </div>
        )}

        {analysis && (
          <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 space-y-3">
            <h4 className="font-medium text-purple-900">Analisis del Creativo</h4>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Mensaje:</span>
                <p className="text-gray-800">{analysis.analysis.creative_analysis.message}</p>
              </div>
              <div>
                <span className="text-gray-500">Tono:</span>
                <p className="text-gray-800">{analysis.analysis.creative_analysis.tone}</p>
              </div>
              <div>
                <span className="text-gray-500">Audiencia:</span>
                <p className="text-gray-800">{analysis.analysis.creative_analysis.target_audience}</p>
              </div>
              <div>
                <span className="text-gray-500">Nivel:</span>
                <p className="text-gray-800">{analysis.analysis.creative_analysis.awareness_level}</p>
              </div>
            </div>

            <div className="border-t border-purple-200 pt-3 mt-3">
              <h5 className="font-medium text-purple-900 mb-2">Recomendacion</h5>
              <p className="text-sm text-gray-800">
                <strong>
                  {analysis.analysis.recommendation.action === 'assign_existing'
                    ? `Asignar a: ${analysis.analysis.recommendation.adset_name}`
                    : 'Crear nuevo Ad Set'}
                </strong>
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {analysis.analysis.recommendation.reasoning}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Confianza: {Math.round(analysis.analysis.recommendation.confidence * 100)}%
              </p>

              {analysis.analysis.recommendation.action === 'assign_existing' && (
                <button
                  onClick={() =>
                    addAdToAdSet.mutate({
                      adsetId: analysis.analysis.recommendation.adset_id!,
                      creativeId: analysis.creative_id,
                    })
                  }
                  disabled={addAdToAdSet.isPending}
                  className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  {addAdToAdSet.isPending ? 'Creando anuncio...' : 'Confirmar y Crear Anuncio'}
                </button>
              )}

              {analysis.analysis.recommendation.new_adset_suggestion && (
                <div className="mt-3 bg-white rounded-lg p-3 border border-purple-100">
                  <p className="text-sm font-medium">Nuevo Ad Set sugerido:</p>
                  <p className="text-sm text-gray-600">
                    {analysis.analysis.recommendation.new_adset_suggestion.name} -{' '}
                    {analysis.analysis.recommendation.new_adset_suggestion.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
