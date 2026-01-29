import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin, requireAuth } from "./middleware";

const analyticsQuerySchema = z.object({
  label: z.string().min(1, "Label parameter is required"),
  platform: z.enum(["web", "ios", "android"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function registerAnalyticsRoutes(app: Express) {
  // Analytics API - proxy to Matomo/Piwik analytics (requires auth)
  app.get("/api/analytics/events", requireAuth, async (req, res) => {
    try {
      const validated = analyticsQuerySchema.safeParse(req.query);
      if (!validated.success) {
        return res
          .status(400)
          .json({ message: validated.error.errors[0]?.message || "Invalid parameters" });
      }

      const { label, platform, startDate, endDate } = validated.data;

      // Default to last 30 days (excluding today for complete data)
      const defaultEndDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const defaultStartDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const actualStartDate = startDate || defaultStartDate;
      const actualEndDate = endDate || defaultEndDate;
      const dateRange = `${actualStartDate},${actualEndDate}`;

      // Get plugin config for analytics-chart
      const plugin = await storage.getPlugin("analytics-chart");
      const config = (plugin?.config as any) || {};

      // Get platform to siteId mapping from config or use defaults
      const platformSiteMapping: Record<string, number> = config.platformSiteMapping || {
        web: 1,
        ios: 2,
        android: 3,
      };

      const idSite = platform ? platformSiteMapping[platform] || 1 : 1;

      // Get API URL from config or use default
      const apiUrl = config.apiUrl || "https://analytics.sutochno.ru/index.php";

      // Get token from config or environment
      const token = config.apiToken || process.env.ANALYTICS_API_TOKEN;
      if (!token) {
        return res.status(500).json({ message: "Analytics API token not configured" });
      }

      // Check cache first
      const { analyticsCache } = await import("../analyticsCache");
      const cacheKey = analyticsCache.generateKey(label, platform || "all", actualStartDate, actualEndDate);
      const cachedData = analyticsCache.get(cacheKey);

      if (cachedData) {
        return res.json(cachedData);
      }

      const url = new URL(apiUrl);
      url.searchParams.set("module", "API");
      url.searchParams.set("format", "JSON");
      url.searchParams.set("idSite", String(idSite));
      url.searchParams.set("period", "day");
      url.searchParams.set("date", dateRange);
      url.searchParams.set("method", "Events.getCategory");
      url.searchParams.set("label", label);
      url.searchParams.set("filter_limit", "100");
      url.searchParams.set("format_metrics", "1");
      url.searchParams.set("fetch_archive_state", "1");
      url.searchParams.set("expanded", "1");
      url.searchParams.set("showMetadata", "0");
      url.searchParams.set("token_auth", token);

      const response = await fetch(url.toString());

      if (!response.ok) {
        return res.status(502).json({ message: "Analytics API returned an error" });
      }

      const data = await response.json();

      // Check if Matomo returned an error
      if (data && typeof data === "object" && data.result === "error") {
        return res.status(502).json({ message: data.message || "Analytics API error" });
      }

      // Store in cache
      analyticsCache.set(cacheKey, data);

      res.json(data);
    } catch (error: any) {
      console.error("Analytics API error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics data" });
    }
  });

  // Analytics cache stats endpoint (admin only)
  app.get("/api/analytics/cache-stats", requireAuth, requireAdmin, async (_req, res) => {
    const { analyticsCache } = await import("../analyticsCache");
    res.json(analyticsCache.getStats());
  });

  // Clear analytics cache endpoint (admin only)
  app.post("/api/analytics/clear-cache", requireAuth, requireAdmin, async (_req, res) => {
    const { analyticsCache } = await import("../analyticsCache");
    analyticsCache.clear();
    res.json({ message: "Cache cleared" });
  });
}
