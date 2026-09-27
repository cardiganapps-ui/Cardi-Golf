/** Provider-neutral course shapes (§13b-A). Adapters map a provider's payload into these. */
export interface ProviderHole {
  number: number
  par: number
  strokeIndex: number
  yards: number | null
}

export interface ProviderTee {
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  parTotal: number | null
  gender: string | null
  holes: ProviderHole[]
}

export interface ProviderCourse {
  externalId: string
  name: string
  clubName: string | null
  location: string | null
  tees: ProviderTee[]
}

export interface ProviderSearchHit {
  externalId: string
  name: string
  clubName: string | null
  location: string | null
}
