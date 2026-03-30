import { z } from "zod";

const envSchema = z.object({
  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  ENCRYPTION_KEY: z.string().default(""),
  DATABASE_URL: z.string().default(""),
  POSTGRES_URL: z.string().default(""),
  BASE_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const messages = Object.entries(formatted)
      .map(([key, errors]) => `  ${key}: ${(errors ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }
  return result.data;
}

export const config = loadConfig();
