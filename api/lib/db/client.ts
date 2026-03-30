import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { config } from "../config.js";
import * as schema from "./schema.js";

let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;
let _initialized = false;

function getClient(): Client {
  if (!_client) {
    if (config.TURSO_DATABASE_URL) {
      _client = createClient({
        url: config.TURSO_DATABASE_URL,
        authToken: config.TURSO_AUTH_TOKEN || undefined,
      });
    } else {
      _client = createClient({ url: "file:/tmp/meta_ads.db" });
    }
  }
  return _client;
}

function getDb(): LibSQLDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    token_type TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    ad_account_id TEXT,
    page_id TEXT,
    business_id TEXT,
    business_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ad_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS creatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS deploy_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    step TEXT NOT NULL,
    entity_name TEXT,
    meta_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

export async function initDb(): Promise<LibSQLDatabase<typeof schema>> {
  const db = getDb();
  if (!_initialized) {
    const client = getClient();
    for (const statement of CREATE_TABLES_SQL) {
      await client.execute(statement);
    }
    _initialized = true;
  }
  return db;
}

/**
 * Lazily-initialized database instance.
 * All route files import this and call methods directly (db.select(), etc.).
 * The Proxy ensures getDb() is called on first property access, so the
 * instance is created exactly once, on demand.
 */
export const db: LibSQLDatabase<typeof schema> = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export type Database = LibSQLDatabase<typeof schema>;
