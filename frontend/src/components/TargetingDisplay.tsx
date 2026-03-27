interface TargetingData {
  age_min?: number
  age_max?: number
  genders?: number[]
  geo_locations?: { countries?: string[]; regions?: Array<{ key: string; name: string }> }
  interests?: Array<{ id: string; name: string }>
  custom_audiences?: Array<{ id: string; name: string }>
  lookalike_audiences?: Array<{ id: string; name: string }>
  excluded_audiences?: Array<{ id: string; name: string }>
}

const GENDER_MAP: Record<number, string> = { 1: 'Hombres', 2: 'Mujeres' }

export default function TargetingDisplay({ targeting }: { targeting: TargetingData | string | null }) {
  if (!targeting) return <span className="text-xs text-gray-400">Sin targeting</span>

  const data: TargetingData = typeof targeting === 'string' ? JSON.parse(targeting) : targeting

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {/* Age */}
      {(data.age_min || data.age_max) && (
        <div>
          <span className="text-gray-500">Edad:</span>{' '}
          <span className="text-gray-800">{data.age_min || 18} - {data.age_max || 65}</span>
        </div>
      )}

      {/* Gender */}
      {data.genders && data.genders.length > 0 && data.genders.length < 2 && (
        <div>
          <span className="text-gray-500">Genero:</span>{' '}
          <span className="text-gray-800">{data.genders.map((g) => GENDER_MAP[g] || g).join(', ')}</span>
        </div>
      )}
      {data.genders && data.genders.length >= 2 && (
        <div>
          <span className="text-gray-500">Genero:</span>{' '}
          <span className="text-gray-800">Todos</span>
        </div>
      )}

      {/* Locations */}
      {data.geo_locations?.countries && data.geo_locations.countries.length > 0 && (
        <div>
          <span className="text-gray-500">Paises:</span>{' '}
          <span className="text-gray-800">{data.geo_locations.countries.join(', ')}</span>
        </div>
      )}

      {/* Interests */}
      {data.interests && data.interests.length > 0 && (
        <div className="col-span-2">
          <span className="text-gray-500">Intereses:</span>{' '}
          <span className="text-gray-800">
            {data.interests.map((i) => i.name).join(', ')}
          </span>
        </div>
      )}

      {/* Custom audiences */}
      {data.custom_audiences && data.custom_audiences.length > 0 && (
        <div className="col-span-2">
          <span className="text-gray-500">Audiencias:</span>{' '}
          <span className="text-gray-800">
            {data.custom_audiences.map((a) => a.name).join(', ')}
          </span>
        </div>
      )}

      {/* Lookalike */}
      {data.lookalike_audiences && data.lookalike_audiences.length > 0 && (
        <div className="col-span-2">
          <span className="text-gray-500">Lookalike:</span>{' '}
          <span className="text-gray-800">
            {data.lookalike_audiences.map((a) => a.name).join(', ')}
          </span>
        </div>
      )}

      {/* Excluded */}
      {data.excluded_audiences && data.excluded_audiences.length > 0 && (
        <div className="col-span-2">
          <span className="text-gray-500">Excluidas:</span>{' '}
          <span className="text-gray-800">
            {data.excluded_audiences.map((a) => a.name).join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}
