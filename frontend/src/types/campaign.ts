export interface Project {
  id: number
  name: string
  status: string
  campaign_objective: string | null
  budget_type: string
  daily_budget: number | null
  lifetime_budget: number | null
  ad_account_id: string | null
  drive_folder_url: string | null
  meta_campaign_id: string | null
  destination_url: string | null
  created_at: string | null
  ad_sets: AdSet[]
}

export interface AdSet {
  id: number
  name: string
  generated_name: string | null
  targeting_json: string | null
  placements_json: string | null
  budget: number | null
  bid_strategy: string
  optimization_goal: string
  meta_adset_id: string | null
  status: string
  ads: Ad[]
}

export interface Ad {
  id: number
  name: string
  generated_name: string | null
  creative_ref: string | null
  headline: string | null
  primary_text: string | null
  description: string | null
  cta: string
  url: string | null
  url_tags: string | null
  meta_ad_id: string | null
  status: string
}

export interface AuthStatus {
  meta_connected: boolean
  meta_ad_account_id: string | null
  meta_page_id: string | null
  meta_business_id: string | null
  meta_business_name: string | null
  google_connected: boolean
  // Aliases for convenience
  business_name?: string | null
  business_id?: string | null
}

export interface MetaPage {
  id: string
  name: string
}

export interface Creative {
  id: number
  original_name: string
  base_name: string | null
  format: string | null
  aspect_ratio: string | null
  media_type: string | null
  file_size_bytes: number | null
  upload_status: string
}

export interface DeployEvent {
  step: string
  entity: string
  status: string
  detail?: string
  success?: boolean
  campaign_id?: string
  errors?: string[]
}

export interface CreativeAnalysis {
  creative_id: number
  filename: string
  media_type: string
  analysis: {
    creative_analysis: {
      message: string
      tone: string
      target_audience: string
      awareness_level: string
      angle: string
    }
    recommendation: {
      action: string
      adset_id: number | null
      adset_name: string
      confidence: number
      reasoning: string
      new_adset_suggestion?: {
        name: string
        description: string
        angle: string
      }
    }
  }
}

export interface BusinessPortfolio {
  id: string
  name: string
}

export interface BusinessAdAccount {
  id: string
  name: string
  account_status: number
  currency: string
}

export interface MetaCampaign {
  id: string
  name: string
  status: string
  objective: string | null
  daily_budget: number | null
}

export interface CreativeWithThumbnail extends Creative {
  thumbnail_url: string | null
  selected: boolean
  adset_name: string | null
}

export interface CreativeAssignment {
  mode: 'subfolder' | 'flat'
  assignments: Record<string, CreativeWithThumbnail[]>
}

export interface ParseResult {
  status: string
  structure: any
  missing_fields: string[]
  ad_sets_count: number
  total_ads: number
}
