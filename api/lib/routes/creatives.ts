import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import fs from "fs";
import path from "path";
import { db } from "../db/client.js";
import { projects, adSets, ads, creatives } from "../db/schema.js";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  FORMAT_PATTERNS,
} from "../utils/constants.js";

const upload = multer({ dest: "/tmp/uploads" });
const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function detectFormatFromName(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [fmt, patterns] of Object.entries(FORMAT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        return fmt;
      }
    }
  }
  return null;
}

function extractBaseName(filename: string): string {
  const stem = path.parse(filename).name;
  for (const patterns of Object.values(FORMAT_PATTERNS)) {
    for (const pattern of patterns) {
      if (stem.toLowerCase().endsWith(pattern)) {
        return stem.slice(0, -pattern.length);
      }
    }
  }
  return stem;
}

function countByFormat(items: Array<{ format?: string | null }>): Record<string, number> {
  const counts: Record<string, number> = { square: 0, vertical: 0, horizontal: 0, unknown: 0 };
  for (const c of items) {
    const fmt = c.format ?? "unknown";
    counts[fmt] = (counts[fmt] ?? 0) + 1;
  }
  return counts;
}

// ── POST /:id/drive-sync ──────────────────────────────────────────────────

router.post("/:id/drive-sync", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const { drive_url } = req.body;

    if (!drive_url) {
      return res.status(400).json({ detail: "drive_url is required" });
    }

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    // Update drive folder URL
    await db
      .update(projects)
      .set({ driveFolderUrl: drive_url })
      .where(eq(projects.id, projectId));

    // Dynamically import Google Drive service
    let downloaded: Array<Record<string, any>>;
    try {
      const { GoogleDriveService } = await import("../services/google-drive.js");
      const driveService = new GoogleDriveService();
      downloaded = await driveService.downloadFolder(drive_url, projectId);
    } catch (e: any) {
      return res.status(500).json({ detail: `Drive sync failed: ${e.message}` });
    }

    // Clear existing creatives for this project
    await db.delete(creatives).where(eq(creatives.projectId, projectId));

    // Save new creatives
    const ASPECT_MAP: Record<string, string> = {
      square: "1:1",
      vertical: "9:16",
      horizontal: "16:9",
    };

    for (const info of downloaded) {
      await db.insert(creatives).values({
        projectId,
        originalName: info.original_name,
        baseName: info.base_name,
        format: info.format ?? null,
        aspectRatio: ASPECT_MAP[info.format] ?? null,
        mediaType: info.media_type ?? null,
        localPath: info.local_path,
        fileSizeBytes: info.file_size_bytes ?? null,
        driveFileId: info.drive_file_id ?? null,
        uploadStatus: "downloaded",
      });
    }

    return res.json({
      status: "synced",
      total_files: downloaded.length,
      by_format: countByFormat(downloaded),
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /:id/upload-manual ───────────────────────────────────────────────

router.post(
  "/:id/upload-manual",
  upload.array("files", 50),
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!projectRows[0]) {
        return res.status(404).json({ detail: "Project not found" });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ detail: "No files uploaded" });
      }

      const storageDir = path.join("/tmp/uploads", String(projectId));
      fs.mkdirSync(storageDir, { recursive: true });

      const ASPECT_MAP: Record<string, string> = {
        square: "1:1",
        vertical: "9:16",
        horizontal: "16:9",
      };

      const uploaded: Array<{ name: string; format: string | null; type: string }> = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) {
          continue;
        }

        const destPath = path.join(storageDir, file.originalname);
        fs.renameSync(file.path, destPath);

        let detectedFormat = detectFormatFromName(file.originalname);

        // If not detected from filename and it's an image, try to detect from dimensions
        if (!detectedFormat && IMAGE_EXTENSIONS.has(ext)) {
          try {
            // Attempt basic dimension detection via reading file header
            // Full implementation would use sharp or similar; for now rely on filename
          } catch {
            // ignore dimension detection errors
          }
        }

        const baseName = extractBaseName(file.originalname);
        const mediaType = IMAGE_EXTENSIONS.has(ext) ? "image" : "video";

        const validFormats = ["square", "vertical", "horizontal"];
        const validMediaTypes = ["image", "video"];

        await db.insert(creatives).values({
          projectId,
          originalName: file.originalname,
          baseName,
          format: detectedFormat && validFormats.includes(detectedFormat)
            ? (detectedFormat as "square" | "vertical" | "horizontal")
            : null,
          aspectRatio: detectedFormat ? (ASPECT_MAP[detectedFormat] ?? null) : null,
          mediaType: validMediaTypes.includes(mediaType)
            ? (mediaType as "image" | "video")
            : null,
          localPath: destPath,
          fileSizeBytes: fs.statSync(destPath).size,
          uploadStatus: "downloaded",
        });

        uploaded.push({
          name: file.originalname,
          format: detectedFormat,
          type: mediaType,
        });
      }

      return res.json({
        status: "uploaded",
        total_files: uploaded.length,
        files: uploaded,
      });
    } catch (e: any) {
      return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
    }
  },
);

// ── GET /:id ──────────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const rows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));

    const result = rows.map((c) => ({
      id: c.id,
      original_name: c.originalName,
      base_name: c.baseName,
      format: c.format,
      aspect_ratio: c.aspectRatio,
      media_type: c.mediaType,
      file_size_bytes: c.fileSizeBytes,
      upload_status: c.uploadStatus,
      meta_image_hash: c.metaImageHash,
      meta_video_id: c.metaVideoId,
    }));

    return res.json(result);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id/mapping ──────────────────────────────────────────────────────

router.get("/:id/mapping", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    // Load creatives
    const creativeRows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));

    const creativeList = creativeRows.map((c) => ({
      id: c.id,
      base_name: c.baseName,
      format: c.format,
      original_name: c.originalName,
      meta_image_hash: c.metaImageHash,
      meta_video_id: c.metaVideoId,
    }));

    let buildCreativesIndex: any;
    let CreativeMapper: any;
    try {
      const mapperModule = await import("../services/creative-mapper.js");
      buildCreativesIndex = mapperModule.buildCreativesIndex;
      CreativeMapper = mapperModule.CreativeMapper;
    } catch {
      // If service not available, return empty mappings
      return res.json([]);
    }

    const index = buildCreativesIndex(creativeList);
    const mapper = new CreativeMapper(index);

    // Load ad sets and ads for this project
    const adSetRows = await db
      .select()
      .from(adSets)
      .where(eq(adSets.projectId, projectId));

    const allMappings: Array<Record<string, any>> = [];

    for (const adSet of adSetRows) {
      const adRows = await db
        .select()
        .from(ads)
        .where(eq(ads.adSetId, adSet.id));

      for (const ad of adRows) {
        const mapping = mapper.getMappingForAd(ad.creativeRef ?? "");
        allMappings.push({
          ad_name: ad.name,
          adset_name: adSet.name,
          creative_ref: ad.creativeRef,
          mappings: mapping.mappings,
          warnings: mapping.warnings,
        });
      }
    }

    return res.json(allMappings);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id/thumbnails ───────────────────────────────────────────────────

router.get("/:id/thumbnails", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const rows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));

    const items = rows.map((c) => {
      let thumbnailUrl: string | null = null;

      if (c.thumbnailPath && fs.existsSync(c.thumbnailPath)) {
        // Convert absolute path to relative URL
        const relPath = path.relative("/tmp/uploads", c.thumbnailPath);
        thumbnailUrl = `/storage/${relPath.replace(/\\/g, "/")}`;
      } else if (c.localPath && c.mediaType === "image") {
        const relPath = path.relative("/tmp/uploads", c.localPath);
        thumbnailUrl = `/storage/${relPath.replace(/\\/g, "/")}`;
      }

      return {
        id: c.id,
        original_name: c.originalName,
        base_name: c.baseName,
        format: c.format,
        aspect_ratio: c.aspectRatio,
        media_type: c.mediaType,
        file_size_bytes: c.fileSizeBytes,
        upload_status: c.uploadStatus ?? "pending",
        thumbnail_url: thumbnailUrl,
        selected: c.selected ?? true,
        adset_name: c.adsetName,
      };
    });

    return res.json({ creatives: items });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /:id/selection ────────────────────────────────────────────────────

router.put("/:id/selection", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const { creative_ids } = req.body as { creative_ids: number[] };

    if (!Array.isArray(creative_ids)) {
      return res.status(400).json({ detail: "creative_ids must be an array" });
    }

    const rows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));

    const selectedSet = new Set(creative_ids);

    for (const creative of rows) {
      await db
        .update(creatives)
        .set({ selected: selectedSet.has(creative.id) })
        .where(eq(creatives.id, creative.id));
    }

    return res.json({ status: "updated", selected_count: creative_ids.length });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id/assignment ───────────────────────────────────────────────────

router.get("/:id/assignment", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    // Get selected creatives
    const creativeRows = await db
      .select()
      .from(creatives)
      .where(and(eq(creatives.projectId, projectId), eq(creatives.selected, true)));

    const creativeList = creativeRows.map((c) => ({
      id: c.id,
      original_name: c.originalName,
      base_name: c.baseName,
      format: c.format,
      media_type: c.mediaType,
      adset_name: c.adsetName,
      file_size_bytes: c.fileSizeBytes,
    }));

    // Get project for parsed structure
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const adsetNames: string[] = [];
    const adCreativeRefs: Record<string, string[]> = {};

    if (project.parsedStructureJson) {
      const parsed = JSON.parse(project.parsedStructureJson);
      for (const adsetData of parsed.ad_sets ?? []) {
        const name = adsetData.name ?? "";
        adsetNames.push(name);
        const refs = (adsetData.ads ?? [])
          .filter((ad: any) => ad.creative_ref)
          .map((ad: any) => ad.creative_ref);
        adCreativeRefs[name] = refs;
      }
    }

    // Detect mode
    const hasAdsetNames = creativeList.some((c) => c.adset_name);
    const mode = hasAdsetNames ? "subfolder" : "flat";

    let assignments: Record<string, any>;
    try {
      const { assignCreativesToAdsets } = await import("../services/creative-mapper.js");
      assignments = assignCreativesToAdsets(creativeList, adsetNames, adCreativeRefs, mode);
    } catch {
      // Fallback: group all creatives under a single key
      assignments = { all: creativeList };
    }

    return res.json({ mode, assignments });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /:id/assignment ───────────────────────────────────────────────────

router.put("/:id/assignment", async (req: Request, res: Response) => {
  try {
    const { assignments } = req.body as { assignments: Record<string, string> };

    if (!assignments || typeof assignments !== "object") {
      return res.status(400).json({ detail: "assignments object is required" });
    }

    for (const [creativeId, adsetName] of Object.entries(assignments)) {
      await db
        .update(creatives)
        .set({ adsetName: adsetName })
        .where(eq(creatives.id, parseInt(creativeId, 10)));
    }

    return res.json({ status: "updated" });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
