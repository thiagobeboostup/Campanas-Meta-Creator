import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import type { DeployEvent } from '../types/campaign'

export default function DeployPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [events, setEvents] = useState<DeployEvent[]>([])
  const [isDeploying, setIsDeploying] = useState(false)
  const [result, setResult] = useState<DeployEvent | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const startDeploy = async () => {
    setIsDeploying(true)
    setEvents([])
    setResult(null)

    try {
      const response = await fetch(`/api/deploy/${id}`, { method: 'POST' })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: DeployEvent = JSON.parse(line.slice(6))
              if (event.status === 'complete' || event.status === 'error') {
                setResult(event)
                setIsDeploying(false)
              } else if (event.status !== 'heartbeat') {
                setEvents((prev) => [...prev, event])
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setResult({ step: 'error', entity: '', status: 'error', detail: String(err) })
      setIsDeploying(false)
    }
  }

  const rollback = useMutation({
    mutationFn: () => api.post(`/deploy/${id}/rollback`),
  })

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [events])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/project/${id}/preview`)} className="text-gray-400 hover:text-gray-600">&larr;</button>
        <h2 className="text-2xl font-bold text-gray-900">Deploy a Meta</h2>
      </div>

      {/* Start button */}
      {!isDeploying && !result && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <p className="text-gray-600">
            Todos los elementos se crearan en estado <strong>PAUSED</strong>.
            Podras activarlos desde Ads Manager una vez verificados.
          </p>
          <button
            onClick={startDeploy}
            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg"
          >
            Iniciar Deploy
          </button>
        </div>
      )}

      {/* Progress log */}
      {(isDeploying || events.length > 0) && (
        <div className="bg-gray-900 rounded-xl p-4 max-h-96 overflow-y-auto" ref={logRef}>
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm font-mono">
              <span>
                {e.status === 'started' ? '...' : e.status === 'success' ? '✓' : e.status === 'failed' ? 'X' : '?'}
              </span>
              <span className={
                e.status === 'success' ? 'text-green-400' :
                e.status === 'failed' ? 'text-red-400' :
                'text-yellow-400'
              }>
                [{e.step}]
              </span>
              <span className="text-gray-300">{e.entity}</span>
              {e.detail && <span className="text-gray-500 text-xs">{e.detail}</span>}
            </div>
          ))}
          {isDeploying && (
            <div className="flex items-center gap-2 py-1 text-sm font-mono text-yellow-400 animate-pulse">
              ... Desplegando...
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 ${
          result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          {result.success ? (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-green-800">Deploy completado</h3>
              <p className="text-sm text-green-700">
                Campaign ID: <code className="bg-green-100 px-2 py-0.5 rounded">{result.campaign_id}</code>
              </p>
              <p className="text-sm text-green-600">
                Todos los elementos estan en PAUSED. Activalos desde Ads Manager.
              </p>
              <div className="flex gap-3 mt-4">
                <a
                  href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Abrir Ads Manager
                </a>
                <button
                  onClick={() => navigate(`/project/${id}/manage`)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  Gestionar Campana
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-red-800">Deploy fallido</h3>
              {result.errors?.map((err, i) => (
                <p key={i} className="text-sm text-red-700">{err}</p>
              ))}
              {result.detail && <p className="text-sm text-red-700">{result.detail}</p>}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => rollback.mutate()}
                  disabled={rollback.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  {rollback.isPending ? 'Haciendo rollback...' : 'Rollback Completo'}
                </button>
                <button
                  onClick={startDeploy}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
