/**
 * Rollback service for undoing Meta campaign deployments.
 */
import { eq, isNotNull, desc, and } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projects, deployLogs } from "../db/schema.js";
import { MetaApiService } from "./meta-api.js";

// ── Constants ───────────────────────────────────────────────────────────────

type DeployStep = "creative_upload" | "campaign" | "adset" | "ad_creative" | "ad";

// Rollback order: reverse of creation order
const ROLLBACK_ORDER: DeployStep[] = [
  "ad",
  "ad_creative",
  "adset",
  "campaign",
];

const STEP_TO_ENTITY_TYPE: Record<string, string> = {
  ad: "ad",
  ad_creative: "ad_creative",
  adset: "adset",
  campaign: "campaign",
};

// ── Types ───────────────────────────────────────────────────────────────────

interface RolledBackEntry {
  type: string;
  meta_id: string;
  name: string | null;
}

interface RollbackResult {
  rolled_back: RolledBackEntry[];
  errors: string[];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Rollback a deployed project by deleting all created Meta entities.
 *
 * @param keepPartial - If true, only rollback failed entities. If false, rollback everything.
 */
export async function rollbackProject(
  db: Database,
  metaService: MetaApiService,
  projectId: number,
  keepPartial: boolean = false,
): Promise<RollbackResult> {
  // Fetch all deploy logs with a meta_id, ordered newest first
  let logs = await db
    .select()
    .from(deployLogs)
    .where(
      and(
        eq(deployLogs.projectId, projectId),
        isNotNull(deployLogs.metaId),
      ),
    )
    .orderBy(desc(deployLogs.id));

  if (keepPartial) {
    // Only rollback entries that are marked as failed
    logs = logs.filter((l) => l.status === "failed");
  }

  const rolledBack: RolledBackEntry[] = [];
  const errors: string[] = [];

  // Process in reverse order (ads first, then adsets, then campaign)
  for (const step of ROLLBACK_ORDER) {
    const stepLogs = logs.filter(
      (l) => l.step === step && l.status !== "rolled_back",
    );

    for (const logEntry of stepLogs) {
      const entityType = STEP_TO_ENTITY_TYPE[logEntry.step];
      if (!entityType || !logEntry.metaId) {
        continue;
      }

      // Skip creative uploads - they don't need rollback
      if (logEntry.step === "creative_upload") {
        continue;
      }

      try {
        await metaService.deleteEntity(entityType, logEntry.metaId);

        // Mark as rolled back
        await db
          .update(deployLogs)
          .set({ status: "rolled_back" })
          .where(eq(deployLogs.id, logEntry.id));

        rolledBack.push({
          type: entityType,
          meta_id: logEntry.metaId,
          name: logEntry.entityName,
        });

        console.log(`Rolled back ${entityType} ${logEntry.metaId}`);
      } catch (e) {
        const errorMsg = `Failed to rollback ${entityType} ${logEntry.metaId}: ${e}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
  }

  // Update project status
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project) {
    await db
      .update(projects)
      .set({ status: "failed", metaCampaignId: null })
      .where(eq(projects.id, projectId));
  }

  return { rolled_back: rolledBack, errors };
}
