import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, deployLogs } from "../db/schema.js";
import { getMetaAuth } from "./auth.js";

const router = Router();

// ── POST /:id (SSE streaming deploy) ─────────────────────────────────────

router.post("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);

    // Validate auth before starting SSE
    let auth: Awaited<ReturnType<typeof getMetaAuth>>;
    try {
      auth = await getMetaAuth(db);
    } catch (e: any) {
      return res.status(e.status ?? 401).json({ detail: e.message ?? "Meta not authenticated" });
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (data: Record<string, any>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Heartbeat interval to keep connection alive
    const heartbeat = setInterval(() => {
      sendEvent({ status: "heartbeat" });
    }, 30_000);

    try {
      const { CampaignBuilder } = await import("../services/campaign-builder.js");
      const { MetaApiService } = await import("../services/meta-api.js");

      const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
      const builder = new CampaignBuilder(db, meta);

      // Deploy with progress callback that sends SSE events
      const result = await builder.deploy(projectId, (event: Record<string, any>) => {
        sendEvent(event);
      });

      sendEvent({
        status: "complete",
        success: result.success,
        campaign_id: result.campaign_id ?? null,
        errors: result.errors ?? [],
      });
    } catch (e: any) {
      sendEvent({ status: "error", detail: e.message ?? "Deployment failed" });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  } catch (e: any) {
    // If headers haven't been sent yet, respond with JSON error
    if (!res.headersSent) {
      return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
    }
    res.end();
  }
});

// ── GET /:id/status ───────────────────────────────────────────────────────

router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    return res.json({
      status: project.status ?? "unknown",
      campaign_id: project.metaCampaignId,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /:id/rollback ───────────────────────────────────────────────────

router.post("/:id/rollback", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);
    const keepPartial = req.query.keep_partial === "true";

    let auth: Awaited<ReturnType<typeof getMetaAuth>>;
    try {
      auth = await getMetaAuth(db);
    } catch (e: any) {
      return res.status(e.status ?? 401).json({ detail: e.message ?? "Meta not authenticated" });
    }

    const { MetaApiService } = await import("../services/meta-api.js");
    const { rollbackProject } = await import("../services/rollback.js");

    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    const result = await rollbackProject(db, meta, projectId, keepPartial);

    return res.json(result);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id/log ──────────────────────────────────────────────────────────

router.get("/:id/log", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);

    const rows = await db
      .select()
      .from(deployLogs)
      .where(eq(deployLogs.projectId, projectId))
      .orderBy(asc(deployLogs.createdAt));

    const logs = rows.map((l) => ({
      id: l.id,
      step: l.step,
      entity_name: l.entityName,
      meta_id: l.metaId,
      status: l.status,
      error_message: l.errorMessage,
      created_at: l.createdAt,
    }));

    return res.json(logs);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
