import type { CreativeWithThumbnail } from '../types/campaign'

interface Props {
  creative: CreativeWithThumbnail
  onToggle: () => void
  selected: boolean
}

const FORMAT_COLORS: Record<string, string> = {
  square: 'bg-purple-100 text-purple-700',
  vertical: 'bg-pink-100 text-pink-700',
  horizontal: 'bg-cyan-100 text-cyan-700',
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '--'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function CreativeThumbnailCard({ creative, onToggle, selected }: Props) {
  const thumbnailSrc = creative.thumbnail_url
    ? `/storage/${creative.thumbnail_url}`
    : null

  const formatLabel = creative.aspect_ratio || creative.format || 'desconocido'
  const formatColor = FORMAT_COLORS[formatLabel] || 'bg-gray-100 text-gray-600'

  const mediaLabel = creative.media_type === 'video' ? 'VID' : 'IMG'

  return (
    <div
      className={`w-[200px] flex-shrink-0 rounded-lg border overflow-hidden transition-all ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-full h-[140px] bg-gray-100 flex items-center justify-center overflow-hidden">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={creative.original_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center text-gray-300">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs mt-1">Sin preview</span>
          </div>
        )}

        {/* Media type badge */}
        <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
          {mediaLabel}
        </span>

        {/* Checkbox */}
        <label className="absolute top-2 right-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </label>
      </div>

      {/* Info */}
      <div className="p-2 space-y-1.5">
        {/* Filename */}
        <p className="text-xs font-medium text-gray-800 truncate" title={creative.original_name}>
          {creative.original_name}
        </p>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${formatColor}`}>
            {formatLabel}
          </span>
          <span className="text-[10px] text-gray-400">
            {formatFileSize(creative.file_size_bytes)}
          </span>
        </div>

        {/* AdSet badge */}
        {creative.adset_name && (
          <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 truncate max-w-full">
            {creative.adset_name}
          </span>
        )}
      </div>
    </div>
  )
}
