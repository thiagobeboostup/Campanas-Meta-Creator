import express from "express";
import { config } from "./lib/config.js";
import { initDb } from "./lib/db/client.js";

import authRouter from "./lib/routes/auth.js";
import campaignsRouter from "./lib/routes/campaigns.js";
import documentsRouter from "./lib/routes/documents.js";
import creativesRouter from "./lib/routes/creatives.js";
import previewRouter from "./lib/routes/preview.js";
import deployRouter from "./lib/routes/deploy.js";
import manageRouter from "./lib/routes/manage.js";
import metaAccountsRouter from "./lib/routes/meta-accounts.js";

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────

const allowedOrigins = config.CORS_ORIGINS
  ? config.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ── Body parsing ────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Mount routers ───────────────────────────────────────────────────────────

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/creatives", creativesRouter);
app.use("/api/preview", previewRouter);
app.use("/api/deploy", deployRouter);
app.use("/api/manage", manageRouter);
app.use("/api/meta", metaAccountsRouter);

// ── Database initialization & server start ──────────────────────────────────

const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`API server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
} else {
  // For Vercel, initialize DB on first request
  let dbInitialized = false;
  app.use(async (_req, _res, next) => {
    if (!dbInitialized) {
      await initDb();
      dbInitialized = true;
    }
    next();
  });
}

export default app;
