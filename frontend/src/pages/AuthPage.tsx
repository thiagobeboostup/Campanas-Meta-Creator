import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { AuthStatus } from '../types/campaign'

export default function AuthPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [oauthError, setOauthError] = useState('')
  const [polling, setPolling] = useState(false)

  const { data: authStatus, isLoading } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
    refetchInterval: polling ? 2000 : false,
  })

  const getOAuthUrl = useMutation({
    mutationFn: () => api.get<{ url: string }>('/auth/meta/oauth/url'),
    onSuccess: (data) => {
      setOauthError('')
      setPolling(true)
      window.open(data.url, 'meta-oauth', 'width=600,height=700,scrollbars=yes')
    },
    onError: (err: Error) => {
      setOauthError(err.message)
    },
  })

  // Stop polling once connected
  const stopPolling = useCallback(() => {
    setPolling(false)
  }, [])

  useEffect(() => {
    if (polling && authStatus?.meta_connected) {
      stopPolling()
    }
  }, [polling, authStatus?.meta_connected, stopPolling])

  // Listen for popup message (OAuth callback)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-success') {
        setPolling(false)
        queryClient.invalidateQueries({ queryKey: ['auth-status'] })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [queryClient])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-gray-900">Conectar cuentas</h2>
        <p className="text-gray-500">Conecta tu cuenta de Meta para gestionar campanas</p>
      </div>

      {/* Meta OAuth - Primary */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Meta Ads</h3>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              authStatus?.meta_connected
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {authStatus?.meta_connected ? 'Conectado' : 'No conectado'}
          </span>
        </div>

        {authStatus?.meta_connected ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">
                Conectado como {authStatus.business_name || 'Meta Business'}
              </p>
              {authStatus.meta_ad_account_id && (
                <p className="text-green-600 text-sm mt-1">
                  Ad Account: {authStatus.meta_ad_account_id}
                </p>
              )}
            </div>
            <button
              onClick={() => navigate('/select-account')}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Ir a seleccion de cuenta
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Conecta tu cuenta de Facebook para acceder a tus Business Portfolios,
              cuentas publicitarias y paginas.
            </p>
            <button
              onClick={() => getOAuthUrl.mutate()}
              disabled={getOAuthUrl.isPending || polling}
              className="w-full py-4 bg-[#1877F2] text-white rounded-lg hover:bg-[#166FE5] disabled:opacity-60 font-semibold text-lg transition-colors flex items-center justify-center gap-3"
            >
              {polling ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Esperando autorizacion...
                </>
              ) : getOAuthUrl.isPending ? (
                'Cargando...'
              ) : (
                <>
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Conectar con Facebook
                </>
              )}
            </button>
            {oauthError && (
              <p className="text-sm text-red-600 text-center">{oauthError}</p>
            )}
            {polling && (
              <p className="text-xs text-gray-400 text-center">
                Completa la autorizacion en la ventana emergente. Esta pagina se actualizara automaticamente.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Google Drive - Secondary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-700">Google Drive</h3>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              authStatus?.google_connected
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {authStatus?.google_connected ? 'Conectado' : 'Opcional'}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Sube el archivo JSON de la cuenta de servicio de Google para sincronizar creativos desde Drive.
        </p>
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const text = await file.text()
            try {
              await api.post('/auth/google/service-account', { credentials_json: text })
              queryClient.invalidateQueries({ queryKey: ['auth-status'] })
            } catch (err) {
              alert(`Error: ${(err as Error).message}`)
            }
          }}
          className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
        />
      </div>
    </div>
  )
}
