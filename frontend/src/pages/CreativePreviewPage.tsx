import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import CreativeThumbnailCard from '../components/CreativeThumbnailCard'

interface CreativeThumbnail {
  id: number
  original_name: string
  base_name: string | null
  format: string | null
  aspect_ratio: string | null
  media_type: string | null
  thumbnail_url: string | null
  selected: boolean
}

interface AdSetAssignment {
  mode: string
  assignments: Record<string, CreativeThumbnail[]>
}

export default function CreativePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id!

  const [driveUrl, setDriveUrl] = useState('')
  const [uploadMode, setUploadMode] = useState<'drive' | 'manual'>('drive')
  const [manualFiles, setManualFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState('')
  const [synced, setSynced] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Sync from Drive
  const syncDrive = useMutation({
    mutationFn: () =>
      api.post(`/creatives/${projectId}/drive-sync?drive_url=${encodeURIComponent(driveUrl)}`),
    onSuccess: () => {
      setSynced(true)
      queryClient.invalidateQueries({ queryKey: ['thumbnails', projectId] })
      queryClient.invalidateQueries({ queryKey: ['assignment', projectId] })
    },
  })

  // Manual upload
  const uploadManual = async () => {
    if (manualFiles.length === 0) return
    setUploadProgress('Subiendo creativos...')

    const form = new FormData()
    manualFiles.forEach((file) => form.append('files', file))

    try {
      const res = await fetch(`/api/creatives/${projectId}/upload-manual`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setUploadProgress(`${data.total_files} creativos subidos`)
      setSynced(true)
      queryClient.invalidateQueries({ queryKey: ['thumbnails', projectId] })
      queryClient.invalidateQueries({ queryKey: ['assignment', projectId] })
    } catch (err) {
      setUploadProgress(`Error: ${(err as Error).message}`)
    }
  }

  // Fetch thumbnails
  const { data: thumbnails = [] } = useQuery<CreativeThumbnail[]>({
    queryKey: ['thumbnails', projectId],
    queryFn: () => api.get(`/creatives/${projectId}/thumbnails`),
    enabled: synced,
  })

  // Fetch assignment
  const { data: assignment } = useQuery<AdSetAssignment>({
    queryKey: ['assignment', projectId],
    queryFn: () => api.get(`/creatives/${projectId}/assignment`),
    enabled: synced,
  })

  // Update selection
  const updateSelection = useMutation({
    mutationFn: (selection: { creative_ids: number[]; selected: boolean }) =>
      api.put(`/creatives/${projectId}/selection`, selection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thumbnails', projectId] })
    },
  })

  // Initialize selected IDs from thumbnails
  useState(() => {
    if (thumbnails.length > 0) {
      setSelectedIds(new Set(thumbnails.filter((t) => t.selected).map((t) => t.id)))
    }
  })

  const handleToggle = (creativeId: number, selected: boolean) => {
    const next = new Set(selectedIds)
    if (selected) {
      next.add(creativeId)
    } else {
      next.delete(creativeId)
    }
    setSelectedIds(next)
    updateSelection.mutate({ creative_ids: [creativeId], selected })
  }

  const handleSelectAll = () => {
    const allIds = thumbnails.map((t) => t.id)
    setSelectedIds(new Set(allIds))
    updateSelection.mutate({ creative_ids: allIds, selected: true })
  }

  const handleDeselectAll = () => {
    const allIds = thumbnails.map((t) => t.id)
    setSelectedIds(new Set())
    updateSelection.mutate({ creative_ids: allIds, selected: false })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/project/${projectId}/strategy`)}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr;
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Creativos</h2>
      </div>

      {/* Section 1: Drive URL / Manual Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Importar creativos</h3>

        {/* Mode selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setUploadMode('drive')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              uploadMode === 'drive' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Google Drive
          </button>
          <button
            onClick={() => setUploadMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              uploadMode === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Subir manualmente
          </button>
        </div>

        {/* Drive mode */}
        {uploadMode === 'drive' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Pega la URL de la carpeta de Google Drive donde estan los creativos.
            </p>
            <input
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => syncDrive.mutate()}
              disabled={!driveUrl || syncDrive.isPending}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {syncDrive.isPending ? 'Sincronizando...' : 'Sincronizar'}
            </button>
            {syncDrive.isError && (
              <p className="text-sm text-red-600">{(syncDrive.error as Error).message}</p>
            )}
            {syncDrive.isSuccess && (
              <p className="text-sm text-green-600">Creativos sincronizados correctamente</p>
            )}
          </div>
        )}

        {/* Manual mode */}
        {uploadMode === 'manual' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Sube los archivos de creativos directamente.
            </p>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => setManualFiles(Array.from(e.target.files || []))}
              className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700"
            />
            {manualFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-gray-600">{manualFiles.length} archivos seleccionados</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {manualFiles.map((f, i) => (
                    <p key={i} className="text-xs text-gray-500">
                      {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                    </p>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={uploadManual}
              disabled={manualFiles.length === 0}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              Subir creativos
            </button>
            {uploadProgress && (
              <p className={`text-sm ${uploadProgress.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {uploadProgress}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Creative Grid */}
      {synced && thumbnails.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              Creativos ({thumbnails.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
              >
                Seleccionar Todos
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
              >
                Deseleccionar Todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {thumbnails.map((creative) => (
              <CreativeThumbnailCard
                key={creative.id}
                creative={creative}
                selected={selectedIds.has(creative.id)}
                onToggle={(selected) => handleToggle(creative.id, selected)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 3: AdSet Assignment */}
      {synced && assignment && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Asignacion a Ad Sets</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              Modo: {assignment.mode === 'subfolder' ? 'Subcarpetas' : 'Por nombre'}
            </span>
          </div>

          <div className="space-y-4">
            {Object.entries(assignment.assignments).map(([adsetName, creatives]) => (
              <div key={adsetName} className="border border-gray-100 rounded-lg p-4">
                <h4 className={`text-sm font-medium mb-3 ${
                  adsetName === '_sin_asignar' ? 'text-yellow-700' : 'text-gray-900'
                }`}>
                  {adsetName === '_sin_asignar' ? 'Sin asignar' : adsetName}
                  <span className="ml-2 text-xs text-gray-400">({creatives.length})</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {creatives.map((c) => (
                    <div
                      key={c.id}
                      className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center"
                      title={c.original_name}
                    >
                      {c.thumbnail_url ? (
                        <img
                          src={c.thumbnail_url}
                          alt={c.original_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-gray-400 text-center px-1 truncate">
                          {c.original_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={() => navigate(`/project/${projectId}/strategy`)}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
        >
          &larr; Volver a Estrategia
        </button>

        <button
          onClick={() => navigate(`/project/${projectId}/preview`)}
          disabled={!synced}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
        >
          Confirmar y Previsualizar &rarr;
        </button>
      </div>
    </div>
  )
}
