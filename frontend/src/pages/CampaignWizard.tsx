import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../types/campaign'

export default function CampaignWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/campaigns/'),
  })

  const deleteProject = useMutation({
    mutationFn: (projectId: number) => api.delete(`/campaigns/${projectId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Proyectos</h2>
        <Link
          to="/campaign-action"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Nueva Campana
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 mb-4">No hay proyectos todavia</p>
          <Link
            to="/campaign-action"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Crear primer proyecto
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="text-sm text-gray-500">
                  {p.campaign_objective?.replace('OUTCOME_', '') || '-'} | {p.budget_type} |{' '}
                  <span
                    className={`font-medium ${
                      p.status === 'deployed'
                        ? 'text-green-600'
                        : p.status === 'failed'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                    }`}
                  >
                    {p.status}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                {/* draft: Continuar + Eliminar */}
                {p.status === 'draft' && (
                  <>
                    <button
                      onClick={() => navigate(`/project/${p.id}/strategy`)}
                      className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100"
                    >
                      Continuar
                    </button>
                    <button
                      onClick={() => deleteProject.mutate(p.id)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100"
                    >
                      Eliminar
                    </button>
                  </>
                )}

                {/* parsed: Creativos + Preview */}
                {p.status === 'parsed' && (
                  <>
                    <button
                      onClick={() => navigate(`/project/${p.id}/creatives`)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
                    >
                      Creativos
                    </button>
                    <button
                      onClick={() => navigate(`/project/${p.id}/preview`)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
                    >
                      Preview
                    </button>
                  </>
                )}

                {/* previewed: Preview + Deploy */}
                {p.status === 'previewed' && (
                  <>
                    <button
                      onClick={() => navigate(`/project/${p.id}/preview`)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => navigate(`/project/${p.id}/deploy`)}
                      className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm hover:bg-purple-100"
                    >
                      Deploy
                    </button>
                  </>
                )}

                {/* deployed: Gestionar */}
                {p.status === 'deployed' && (
                  <button
                    onClick={() => navigate(`/project/${p.id}/manage`)}
                    className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100"
                  >
                    Gestionar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
