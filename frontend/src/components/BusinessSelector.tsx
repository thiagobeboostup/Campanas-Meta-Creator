import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BusinessPortfolio, BusinessAdAccount } from '../types/campaign'

interface Props {
  businesses: BusinessPortfolio[]
  onSelectAccount: (
    business_id: string,
    business_name: string,
    ad_account_id: string,
    ad_account_name: string,
  ) => void
}

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Activa', color: 'bg-green-100 text-green-700' },
  2: { label: 'Deshabilitada', color: 'bg-red-100 text-red-700' },
  3: { label: 'No aprobada', color: 'bg-yellow-100 text-yellow-700' },
  7: { label: 'Pendiente revision', color: 'bg-orange-100 text-orange-700' },
  9: { label: 'En periodo de gracia', color: 'bg-blue-100 text-blue-700' },
  101: { label: 'Cerrada temporalmente', color: 'bg-gray-100 text-gray-700' },
}

export default function BusinessSelector({ businesses, onSelectAccount }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Portfolios de Negocio</h3>
      {businesses.length === 0 && (
        <p className="text-sm text-gray-400">No se encontraron portfolios de negocio.</p>
      )}
      {businesses.map((biz) => (
        <BusinessItem
          key={biz.id}
          business={biz}
          isExpanded={expandedId === biz.id}
          selectedAccountId={selectedAccountId}
          onToggle={() => toggleExpand(biz.id)}
          onSelect={(accountId, accountName) => {
            setSelectedAccountId(accountId)
            onSelectAccount(biz.id, biz.name, accountId, accountName)
          }}
        />
      ))}
    </div>
  )
}

function BusinessItem({
  business,
  isExpanded,
  selectedAccountId,
  onToggle,
  onSelect,
}: {
  business: BusinessPortfolio
  isExpanded: boolean
  selectedAccountId: string | null
  onToggle: () => void
  onSelect: (accountId: string, accountName: string) => void
}) {
  const { data: accounts = [], isLoading, isError } = useQuery<BusinessAdAccount[]>({
    queryKey: ['business-ad-accounts', business.id],
    queryFn: () => api.get(`/meta/businesses/${business.id}/ad-accounts`),
    enabled: isExpanded,
  })

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Business header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-900">{business.name}</span>
        </div>
        <span className="text-xs text-gray-400">{business.id}</span>
      </button>

      {/* Ad accounts list */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-gray-500">Cargando cuentas publicitarias...</div>
          )}
          {isError && (
            <div className="px-4 py-3 text-sm text-red-500">Error al cargar cuentas publicitarias</div>
          )}
          {!isLoading && !isError && accounts.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-400">Sin cuentas publicitarias</div>
          )}
          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id
            const statusInfo = STATUS_LABELS[acc.account_status] || {
              label: `Estado ${acc.account_status}`,
              color: 'bg-gray-100 text-gray-600',
            }

            return (
              <button
                key={acc.id}
                onClick={() => onSelect(acc.id, acc.name)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-50 border-l-2 border-blue-500'
                    : 'hover:bg-gray-100 border-l-2 border-transparent'
                }`}
              >
                <div className="flex flex-col">
                  <span className={`text-sm ${isSelected ? 'font-semibold text-blue-900' : 'text-gray-800'}`}>
                    {acc.name}
                  </span>
                  <span className="text-xs text-gray-400">{acc.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{acc.currency}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
