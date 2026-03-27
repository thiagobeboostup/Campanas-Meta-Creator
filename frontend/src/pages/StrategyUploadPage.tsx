import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import MissingFieldsForm from '../components/MissingFieldsForm'

interface ParseResult {
  campaign_name: string | null
  campaign_objective: string | null
  budget_type: string | null
  daily_budget: number | null
  destination_url: string | null
  ad_sets_count: number
  total_ads_count: number
  missing_fields: string[]
  found_fields: string[]
}

export default function StrategyUploadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id!

  const [uploadDone, setUploadDone] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)

  // Step 1: Upload file
  const uploadDoc = useMutation({
    mutationFn: (file: File) => api.upload(`/documents/${projectId}/upload`, file),
    onSuccess: () => setUploadDone(true),
  })

  // Step 2: Parse with AI
  const parseDoc = useMutation({
    mutationFn: () => api.post<ParseResult>(`/documents/${projectId}/parse`),
    onSuccess: (data) => {
      setParseResult(data)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  // Step 3: Complete missing fields
  const completeFields = useMutation({
    mutationFn: (fields: Record<string, string>) =>
      api.post<ParseResult>(`/documents/${projectId}/complete-fields`, fields),
    onSuccess: (data) => {
      setParseResult(data)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const allFieldsComplete = parseResult && parseResult.missing_fields.length === 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/campaign-action')}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr;
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Estructura de Campana</h2>
      </div>

      {/* Step 1: File Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
            uploadDone ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>1</span>
          <h3 className="font-semibold text-gray-900">Subir documento de estrategia</h3>
        </div>
        <p className="text-sm text-gray-600">
          Sube un documento (PDF, DOCX o TXT) que describa la estructura de la campana:
          ad sets, audiencias, angulos de venta, copys, creativos, CTAs, etc.
        </p>

        <input
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadDoc.mutate(file)
          }}
          className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700"
        />

        {uploadDoc.isPending && (
          <p className="text-sm text-blue-600 animate-pulse">Subiendo documento...</p>
        )}
        {uploadDoc.isSuccess && (
          <p className="text-sm text-green-600">Documento subido correctamente</p>
        )}
        {uploadDoc.isError && (
          <p className="text-sm text-red-600">{(uploadDoc.error as Error).message}</p>
        )}
      </div>

      {/* Step 2: Parse with AI */}
      {uploadDone && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
              parseResult ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>2</span>
            <h3 className="font-semibold text-gray-900">Analizar con IA</h3>
          </div>

          {!parseResult && (
            <button
              onClick={() => parseDoc.mutate()}
              disabled={parseDoc.isPending}
              className="w-full py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
            >
              {parseDoc.isPending ? 'Parseando con IA...' : 'Parsear con Claude AI'}
            </button>
          )}

          {parseDoc.isPending && (
            <div className="flex items-center gap-3 text-sm text-purple-600">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analizando documento con Claude AI...
            </div>
          )}

          {parseDoc.isError && (
            <p className="text-sm text-red-600">{(parseDoc.error as Error).message}</p>
          )}

          {parseResult && (
            <p className="text-sm text-green-600">Documento analizado correctamente</p>
          )}
        </div>
      )}

      {/* Step 3: Missing fields */}
      {parseResult && parseResult.missing_fields.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-yellow-100 text-yellow-700">3</span>
            <h3 className="font-semibold text-gray-900">Campos faltantes</h3>
          </div>

          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <span className="font-medium text-green-700">Campos encontrados:</span>{' '}
              {parseResult.found_fields.length > 0
                ? parseResult.found_fields.join(', ')
                : 'Ninguno'}
            </p>
            <p>
              <span className="font-medium text-yellow-700">Campos faltantes:</span>{' '}
              {parseResult.missing_fields.join(', ')}
            </p>
          </div>

          <MissingFieldsForm
            missingFields={parseResult.missing_fields}
            onSubmit={(fields) => completeFields.mutate(fields)}
            isLoading={completeFields.isPending}
          />

          {completeFields.isError && (
            <p className="text-sm text-red-600">{(completeFields.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Step 4: Summary when all complete */}
      {allFieldsComplete && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-green-100 text-green-700">
              &#10003;
            </span>
            <h3 className="font-semibold text-gray-900">Resumen de la estrategia</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Nombre de campana</p>
              <p className="font-medium text-gray-900">{parseResult.campaign_name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Objetivo</p>
              <p className="font-medium text-gray-900">
                {parseResult.campaign_objective?.replace('OUTCOME_', '') || '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Tipo de presupuesto</p>
              <p className="font-medium text-gray-900">{parseResult.budget_type || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Presupuesto diario</p>
              <p className="font-medium text-gray-900">
                {parseResult.daily_budget != null ? `${parseResult.daily_budget} EUR` : '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">URL de destino</p>
              <p className="font-medium text-gray-900 truncate">{parseResult.destination_url || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Ad Sets / Ads</p>
              <p className="font-medium text-gray-900">
                {parseResult.ad_sets_count} ad sets, {parseResult.total_ads_count} ads
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={() => navigate('/campaign-action')}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
        >
          &larr; Volver
        </button>

        <button
          onClick={() => navigate(`/project/${projectId}/creatives`)}
          disabled={!allFieldsComplete}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
        >
          Siguiente: Creativos &rarr;
        </button>
      </div>
    </div>
  )
}
