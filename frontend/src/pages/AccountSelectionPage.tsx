import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import BusinessSelector from '../components/BusinessSelector'
import type { AuthStatus, BusinessPortfolio, MetaPage } from '../types/campaign'

export default function AccountSelectionPage() {
  const navigate = useNavigate()

  const [selectedBusiness, setSelectedBusiness] = useState<{ id: string; name: string } | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedPageId, setSelectedPageId] = useState('')

  const { data: authStatus } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
  })

  const { data: businesses = [], isLoading: bizLoading } = useQuery<BusinessPortfolio[]>({
    queryKey: ['businesses'],
    queryFn: () => api.get('/meta/businesses'),
    refetchInterval: 30000,
  })

  const { data: pages = [], isLoading: pagesLoading } = useQuery<MetaPage[]>({
    queryKey: ['meta-pages'],
    queryFn: () => api.get('/meta/pages'),
  })

  const selectAccount = useMutation({
    mutationFn: () =>
      api.post('/meta/select-account', {
        business_id: selectedBusiness?.id,
        business_name: selectedBusiness?.name,
        ad_account_id: selectedAccountId,
        page_id: selectedPageId || null,
      }),
    onSuccess: () => {
      navigate('/campaign-action')
    },
  })

  const canConfirm = selectedBusiness && selectedAccountId

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Seleccionar cuenta</h2>
        <p className="text-gray-500">
          Elige el Business Portfolio, cuenta publicitaria y pagina de Facebook para trabajar.
        </p>
      </div>

      {/* Current selection summary */}
      {authStatus?.meta_connected && authStatus.meta_ad_account_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800">Configuracion actual</p>
          <div className="mt-1 text-sm text-blue-600 space-y-0.5">
            {authStatus.business_name && <p>Business: {authStatus.business_name}</p>}
            <p>Ad Account: {authStatus.meta_ad_account_id}</p>
            {authStatus.meta_page_id && <p>Page: {authStatus.meta_page_id}</p>}
          </div>
        </div>
      )}

      {/* Business Portfolio + Ad Account */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <BusinessSelector
          businesses={businesses}
          onSelectAccount={(bizId, bizName, accountId) => {
            setSelectedBusiness({ id: bizId, name: bizName })
            setSelectedAccountId(accountId)
          }}
        />

        {bizLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Cargando portfolios...
          </div>
        )}
      </div>

      {/* Page selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Pagina de Facebook</label>
        <p className="text-xs text-gray-400">
          Requerida para publicar creativos. Puedes omitirla por ahora.
        </p>
        {pagesLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Cargando paginas...
          </div>
        ) : pages.length === 0 ? (
          <p className="text-sm text-gray-400">No se encontraron paginas asociadas.</p>
        ) : (
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="">Seleccionar pagina (opcional)...</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name} ({page.id})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selection summary */}
      {selectedBusiness && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-1">
          <p className="text-sm font-medium text-gray-700">Seleccion:</p>
          <p className="text-sm text-gray-600">Business: {selectedBusiness.name}</p>
          {selectedAccountId && <p className="text-sm text-gray-600">Ad Account: {selectedAccountId}</p>}
          {selectedPageId && (
            <p className="text-sm text-gray-600">
              Page: {pages.find((p) => p.id === selectedPageId)?.name || selectedPageId}
            </p>
          )}
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={() => selectAccount.mutate()}
        disabled={!canConfirm || selectAccount.isPending}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {selectAccount.isPending ? 'Guardando...' : 'Confirmar Seleccion'}
      </button>

      {selectAccount.isError && (
        <p className="text-sm text-red-600 text-center">
          {(selectAccount.error as Error).message}
        </p>
      )}
    </div>
  )
}
