import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./middleware";

const analyticsQuerySchema = z.object({
  label: z.string().min(1, "Label parameter is required"),
  platform: z.enum(["web", "ios", "android"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function registerAnalyticsRoutes(app: Express): void {
  app.get("/api/analytics/events", requireAuth, async (req, res) => {
    try {
      const validated = analyticsQuerySchema.safeParse(req.query);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid parameters" });
      }
      
      const { label, platform, startDate, endDate } = validated.data;
      
      const defaultEndDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const defaultStartDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const actualStartDate = startDate || defaultStartDate;
      const actualEndDate = endDate || defaultEndDate;
      const dateRange = `${actualStartDate},${actualEndDate}`;
      
      const plugin = await storage.getPlugin("analytics-chart");
      const config = (plugin?.config as any) || {};
      
      const platformSiteMapping: Record<string, number> = config.platformSiteMapping || {
        "web": 1,
        "ios": 2,
        "android": 3
      };
      
      const idSite = platform ? (platformSiteMapping[platform] || 1) : 1;
      const apiUrl = config.apiUrl || "https://analytics.sutochno.ru/index.php";
      const token = config.apiToken || process.env.ANALYTICS_API_TOKEN;
      
      if (!token) {
        return res.status(500).json({ message: "Analytics API token not configured" });
      }
      
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
      
      if (data && typeof data === 'object' && data.result === 'error') {
        return res.status(502).json({ message: data.message || "Analytics API error" });
      }
      
      analyticsCache.set(cacheKey, data);
      
      res.json(data);
    } catch (error: any) {
      console.error("Analytics API error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics data" });
    }
  });
  
  app.get("/api/analytics/cache-stats", requireAuth, requireAdmin, async (req, res) => {
    const { analyticsCache } = await import("../analyticsCache");
    res.json(analyticsCache.getStats());
  });
  
  app.post("/api/analytics/clear-cache", requireAuth, requireAdmin, async (req, res) => {
    const { analyticsCache } = await import("../analyticsCache");
    analyticsCache.clear();
    res.json({ message: "Cache cleared" });
  });
}
