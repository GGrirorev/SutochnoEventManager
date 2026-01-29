import type { Express } from "express";
import { requireAuth, requireAdmin } from "./middleware";
import { httpStats, getGlobalRateLimiterStatus } from "../httpClient";

export function registerHttpLogsRoutes(app: Express): void {
  app.get("/api/http-logs/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = httpStats.getStats();
      const rateLimiter = getGlobalRateLimiterStatus();
      res.json({ ...stats, rateLimiter });
    } catch (error) {
      console.error("Failed to get HTTP stats:", error);
      res.status(500).json({ message: "Failed to get HTTP stats" });
    }
  });

  app.get("/api/http-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = httpStats.getLogs(limit, offset);
      res.json(result);
    } catch (error) {
      console.error("Failed to get HTTP logs:", error);
      res.status(500).json({ message: "Failed to get HTTP logs" });
    }
  });

  app.post("/api/http-logs/clear", requireAuth, requireAdmin, async (req, res) => {
    try {
      httpStats.clear();
      res.json({ message: "HTTP logs cleared" });
    } catch (error) {
      console.error("Failed to clear HTTP logs:", error);
      res.status(500).json({ message: "Failed to clear HTTP logs" });
    }
  });
}
