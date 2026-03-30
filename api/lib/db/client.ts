import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

let _db: NeonHttpDatabase<typeof schema> | null = null;
let _initialized = false;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL environment variable is required");
    }
    const sql = neon(databaseUrl);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  token_type TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  ad_account_id TEXT,
  page_id TEXT,
  business_id TEXT,
  business_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  campaign_objective TEXT,
  budget_type TEXT NOT NULL DEFAULT 'CBO',
  daily_budget REAL,
  lifetime_budget REAL,
  ad_account_id TEXT,
  business_id TEXT,
  mode TEXT NOT NULL DEFAULT 'create',
  meta_source_campaign_id TEXT,
  drive_folder_url TEXT,
  raw_document_text TEXT,
  parsed_structure_json TEXT,
  naming_template TEXT,
  meta_campaign_id TEXT,
  destination_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_sets (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  generated_name TEXT,
  targeting_json TEXT,
  placements_json TEXT,
  budget REAL,
  bid_strategy TEXT NOT NULL DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  optimization_goal TEXT NOT NULL DEFAULT 'OFFSITE_CONVERSIONS',
  meta_adset_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  ad_set_id INTEGER NOT NULL REFERENCES ad_sets(id),
  name TEXT NOT NULL,
  generated_name TEXT,
  creative_ref TEXT,
  creative_mapping_json TEXT,
  headline TEXT,
  primary_text TEXT,
  description TEXT,
  cta TEXT NOT NULL DEFAULT 'SHOP_NOW',
  url TEXT,
  url_tags TEXT,
  meta_ad_id TEXT,
  meta_creative_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creatives (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  original_name TEXT NOT NULL,
  base_name TEXT,
  format TEXT,
  aspect_ratio TEXT,
  media_type TEXT,
  local_path TEXT,
  file_size_bytes INTEGER,
  drive_file_id TEXT,
  meta_image_hash TEXT,
  meta_video_id TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  selected INTEGER NOT NULL DEFAULT 1,
  thumbnail_path TEXT,
  adset_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deploy_log (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  step TEXT NOT NULL,
  entity_name TEXT,
  meta_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export async function initDb(): Promise<NeonHttpDatabase<typeof schema>> {
  const db = getDb();
  if (!_initialized) {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL required");
    const sql = neon(databaseUrl);
    // Execute each CREATE TABLE statement separately
    const statements = CREATE_TABLES_SQL.split(";").map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await sql(stmt);
    }
    _initialized = true;
  }
  return db;
}

/**
 * Lazily-initialized database instance.
 * The Proxy ensures getDb() is called on first property access.
 */
export const db: NeonHttpDatabase<typeof schema> = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export type Database = NeonHttpDatabase<typeof schema>;
