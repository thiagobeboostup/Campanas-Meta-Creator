import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── auth_tokens ──────────────────────────────────────────────────────────────

export const authTokens = sqliteTable("auth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider", { enum: ["meta", "google"] }).notNull(),
  tokenType: text("token_type", {
    enum: ["long_lived", "oauth", "service_account"],
  }).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  adAccountId: text("ad_account_id"),
  pageId: text("page_id"),
  businessId: text("business_id"),
  businessName: text("business_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── projects ─────────────────────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status", {
    enum: ["draft", "parsed", "previewed", "deploying", "deployed", "failed"],
  })
    .notNull()
    .default("draft"),
  campaignObjective: text("campaign_objective"),
  budgetType: text("budget_type", { enum: ["CBO", "ABO"] })
    .notNull()
    .default("CBO"),
  dailyBudget: real("daily_budget"),
  lifetimeBudget: real("lifetime_budget"),
  adAccountId: text("ad_account_id"),
  businessId: text("business_id"),
  mode: text("mode").notNull().default("create"),
  metaSourceCampaignId: text("meta_source_campaign_id"),
  driveFolderUrl: text("drive_folder_url"),
  rawDocumentText: text("raw_document_text"),
  parsedStructureJson: text("parsed_structure_json"),
  namingTemplate: text("naming_template"),
  metaCampaignId: text("meta_campaign_id"),
  destinationUrl: text("destination_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── ad_sets ──────────────────────────────────────────────────────────────────

export const adSets = sqliteTable("ad_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  generatedName: text("generated_name"),
  targetingJson: text("targeting_json"),
  placementsJson: text("placements_json"),
  budget: real("budget"),
  bidStrategy: text("bid_strategy")
    .notNull()
    .default("LOWEST_COST_WITHOUT_CAP"),
  optimizationGoal: text("optimization_goal")
    .notNull()
    .default("OFFSITE_CONVERSIONS"),
  metaAdsetId: text("meta_adset_id"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── ads ──────────────────────────────────────────────────────────────────────

export const ads = sqliteTable("ads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adSetId: integer("ad_set_id")
    .notNull()
    .references(() => adSets.id),
  name: text("name").notNull(),
  generatedName: text("generated_name"),
  creativeRef: text("creative_ref"),
  creativeMappingJson: text("creative_mapping_json"),
  headline: text("headline"),
  primaryText: text("primary_text"),
  description: text("description"),
  cta: text("cta").notNull().default("SHOP_NOW"),
  url: text("url"),
  urlTags: text("url_tags"),
  metaAdId: text("meta_ad_id"),
  metaCreativeId: text("meta_creative_id"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── creatives ────────────────────────────────────────────────────────────────

export const creatives = sqliteTable("creatives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  originalName: text("original_name").notNull(),
  baseName: text("base_name"),
  format: text("format", { enum: ["square", "vertical", "horizontal"] }),
  aspectRatio: text("aspect_ratio"),
  mediaType: text("media_type", { enum: ["image", "video"] }),
  localPath: text("local_path"),
  fileSizeBytes: integer("file_size_bytes"),
  driveFileId: text("drive_file_id"),
  metaImageHash: text("meta_image_hash"),
  metaVideoId: text("meta_video_id"),
  uploadStatus: text("upload_status", {
    enum: ["pending", "downloaded", "uploading", "uploaded", "failed"],
  })
    .notNull()
    .default("pending"),
  selected: integer("selected", { mode: "boolean" }).notNull().default(true),
  thumbnailPath: text("thumbnail_path"),
  adsetName: text("adset_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── deploy_log ───────────────────────────────────────────────────────────────

export const deployLogs = sqliteTable("deploy_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  step: text("step", {
    enum: ["creative_upload", "campaign", "adset", "ad_creative", "ad"],
  }).notNull(),
  entityName: text("entity_name"),
  metaId: text("meta_id"),
  status: text("status", {
    enum: ["pending", "success", "failed", "rolled_back"],
  })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
