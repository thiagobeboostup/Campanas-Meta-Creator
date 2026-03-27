import { useState } from 'react'

interface Props {
  missingFields: string[]
  onSubmit: (values: Record<string, string>) => void
  isSubmitting: boolean
}

const OBJECTIVES = [
  { value: 'OUTCOME_SALES', label: 'Ventas / Conversiones' },
  { value: 'OUTCOME_TRAFFIC', label: 'Trafico' },
  { value: 'OUTCOME_LEADS', label: 'Generacion de Leads' },
  { value: 'OUTCOME_AWARENESS', label: 'Reconocimiento / Alcance' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Interaccion' },
]

const BUDGET_TYPES = [
  { value: 'CBO', label: 'CBO (Presupuesto a nivel campana)' },
  { value: 'ABO', label: 'ABO (Presupuesto a nivel ad set)' },
]

interface FieldConfig {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}

const FIELD_MAP: Record<string, FieldConfig> = {
  campaign_name: {
    key: 'campaign_name',
    label: 'Nombre de la campana',
    type: 'text',
    placeholder: 'Ej: Campana Verano 2026',
  },
  campaign_objective: {
    key: 'campaign_objective',
    label: 'Objetivo',
    type: 'select',
    options: OBJECTIVES,
  },
  budget_type: {
    key: 'budget_type',
    label: 'Tipo de presupuesto',
    type: 'select',
    options: BUDGET_TYPES,
  },
  daily_budget: {
    key: 'daily_budget',
    label: 'Presupuesto diario (EUR)',
    type: 'number',
    placeholder: 'Ej: 50',
  },
  destination_url: {
    key: 'destination_url',
    label: 'URL de destino',
    type: 'text',
    placeholder: 'https://ejemplo.com/landing',
  },
}

export default function MissingFieldsForm({ missingFields, onSubmit, isSubmitting }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of missingFields) {
      initial[field] = ''
    }
    return initial
  })

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  const fields = missingFields
    .map((f) => FIELD_MAP[f])
    .filter((f): f is FieldConfig => f !== undefined)

  if (fields.length === 0) return null

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Informacion faltante</h3>
        <p className="text-sm text-gray-500 mt-1">
          Completa los siguientes campos para continuar con la configuracion de la campana.
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>

            {field.type === 'select' ? (
              <select
                value={values[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
              >
                <option value="">Seleccionar...</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={values[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
                min={field.type === 'number' ? 1 : undefined}
                step={field.type === 'number' ? 'any' : undefined}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
      >
        {isSubmitting ? 'Procesando...' : 'Completar Informacion'}
      </button>
    </form>
  )
}
