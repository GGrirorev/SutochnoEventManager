import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, AuthenticatedRequest } from "./middleware";
import { fetchWithTimeout, createRateLimiter, type RateLimiter } from "../httpClient";

export function registerAlertRoutes(app: Express): void {
  app.get("/api/alerts", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10000;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getAlerts(limit, offset);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.delete("/api/alerts/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      
      if (user.role !== "admin" && user.role !== "analyst") {
        return res.status(403).json({ message: "Только администратор и аналитик могут удалять алерты" });
      }
      
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid alert ID" });
      }
      
      await storage.deleteAlert(id);
      res.json({ message: "Alert deleted" });
    } catch (error) {
      console.error("Failed to delete alert:", error);
      res.status(500).json({ message: "Failed to delete alert" });
    }
  });

  app.post("/api/alerts/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      
      if (user.role !== "admin" && user.role !== "analyst") {
        return res.status(403).json({ message: "Только администратор и аналитик могут удалять алерты" });
      }
      
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Необходимо указать массив ID алертов" });
      }
      
      let deleted = 0;
      for (const id of ids) {
        await storage.deleteAlert(id);
        deleted++;
      }
      
      res.json({ message: `Удалено алертов: ${deleted}`, deleted });
    } catch (error) {
      console.error("Failed to bulk delete alerts:", error);
      res.status(500).json({ message: "Failed to bulk delete alerts" });
    }
  });

  app.get("/api/alerts/settings", requireAuth, async (req, res) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Только администратор может просматривать настройки алертов" });
      }
      
      const settings = await storage.getAlertSettings();
      res.json(settings || {
        matomoUrl: "",
        matomoToken: "",
        matomoSiteId: "",
        dropThreshold: 30,
        maxConcurrency: 5,
        isEnabled: true
      });
    } catch (error) {
      console.error("Failed to get alert settings:", error);
      res.status(500).json({ message: "Failed to get alert settings" });
    }
  });

  app.put("/api/alerts/settings", requireAuth, async (req, res) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Только администратор может изменять настройки алертов" });
      }
      
      const { matomoUrl, matomoToken, matomoSiteId, dropThreshold, maxConcurrency, isEnabled } = req.body;
      
      const settings = await storage.updateAlertSettings({
        matomoUrl,
        matomoToken,
        matomoSiteId,
        dropThreshold: dropThreshold ? parseInt(dropThreshold) : undefined,
        maxConcurrency: maxConcurrency ? parseInt(maxConcurrency) : undefined,
        isEnabled
      });
      
      res.json(settings);
    } catch (error) {
      console.error("Failed to update alert settings:", error);
      res.status(500).json({ message: "Failed to update alert settings" });
    }
  });

  app.get("/api/alerts/check-stream", requireAuth, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const alertConfig = await storage.getAlertSettings();
      
      if (!alertConfig || !alertConfig.isEnabled) {
        sendProgress({ error: "Модуль алертов отключен. Включите его в настройках." });
        res.end();
        return;
      }
      
      const apiUrl = alertConfig.matomoUrl || "https://analytics.sutochno.ru/index.php";
      const token = alertConfig.matomoToken || process.env.ANALYTICS_API_TOKEN;
      
      if (!token) {
        sendProgress({ error: "API токен не настроен. Укажите его в настройках алертов." });
        res.end();
        return;
      }
      
      const platformSiteMapping: Record<string, number> = {};
      if (alertConfig.matomoSiteId) {
        alertConfig.matomoSiteId.split(",").forEach(part => {
          const [platform, id] = part.trim().split(":");
          if (platform && id) {
            platformSiteMapping[platform.toLowerCase()] = parseInt(id);
          }
        });
      }
      if (Object.keys(platformSiteMapping).length === 0) {
        platformSiteMapping["web"] = 1;
        platformSiteMapping["ios"] = 2;
        platformSiteMapping["android"] = 3;
      }
      
      const dropThreshold = alertConfig.dropThreshold || 30;
      const CONCURRENCY = alertConfig.maxConcurrency || 5;
      const rateLimiter = createRateLimiter(CONCURRENCY, 200);
      
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(now);
      dayBefore.setDate(dayBefore.getDate() - 2);
      
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      const eventsToMonitor = await storage.getEventsForMonitoring();
      const platformsToCheck = ["web", "ios", "android"];
      
      const checks: { event: typeof eventsToMonitor[0]; platform: string }[] = [];
      for (const event of eventsToMonitor) {
        for (const platform of platformsToCheck) {
          if (event.platforms.map(p => p.toLowerCase()).includes(platform)) {
            checks.push({ event, platform });
          }
        }
      }
      
      sendProgress({ 
        status: "started", 
        total: checks.length, 
        completed: 0,
        eventsCount: eventsToMonitor.length 
      });
      
      const alertsCreated: any[] = [];
      let completed = 0;
      
      for (let i = 0; i < checks.length; i += CONCURRENCY) {
        const batch = checks.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async ({ event, platform }) => {
          const label = `${event.category} > @${event.action}`;
          const idSite = platformSiteMapping[platform] || 1;
          
          const urlYesterday = new URL(apiUrl);
          urlYesterday.searchParams.set("module", "API");
          urlYesterday.searchParams.set("format", "JSON");
          urlYesterday.searchParams.set("idSite", String(idSite));
          urlYesterday.searchParams.set("period", "day");
          urlYesterday.searchParams.set("date", yesterdayStr);
          urlYesterday.searchParams.set("method", "Events.getCategory");
          urlYesterday.searchParams.set("label", label);
          urlYesterday.searchParams.set("filter_limit", "100");
          urlYesterday.searchParams.set("token_auth", token);
          
          const urlDayBefore = new URL(apiUrl);
          urlDayBefore.searchParams.set("module", "API");
          urlDayBefore.searchParams.set("format", "JSON");
          urlDayBefore.searchParams.set("idSite", String(idSite));
          urlDayBefore.searchParams.set("period", "day");
          urlDayBefore.searchParams.set("date", dayBeforeStr);
          urlDayBefore.searchParams.set("method", "Events.getCategory");
          urlDayBefore.searchParams.set("label", label);
          urlDayBefore.searchParams.set("filter_limit", "100");
          urlDayBefore.searchParams.set("token_auth", token);
          
          try {
            await rateLimiter.acquire();
            const [resYesterday, resDayBefore] = await Promise.all([
              fetchWithTimeout(urlYesterday.toString(), { timeout: 30000 }),
              fetchWithTimeout(urlDayBefore.toString(), { timeout: 30000 })
            ]).finally(() => rateLimiter.release());
            
            if (!resYesterday.ok || !resDayBefore.ok) return;
            
            const dataYesterday = await resYesterday.json();
            const dataDayBefore = await resDayBefore.json();
            
            let yesterdayCount = 0;
            let dayBeforeCount = 0;
            
            if (Array.isArray(dataYesterday) && dataYesterday.length > 0) {
              yesterdayCount = dataYesterday[0]?.nb_events || 0;
            } else if (dataYesterday && typeof dataYesterday === 'object') {
              yesterdayCount = dataYesterday.nb_events || 0;
            }
            
            if (Array.isArray(dataDayBefore) && dataDayBefore.length > 0) {
              dayBeforeCount = dataDayBefore[0]?.nb_events || 0;
            } else if (dataDayBefore && typeof dataDayBefore === 'object') {
              dayBeforeCount = dataDayBefore.nb_events || 0;
            }
            
            if (dayBeforeCount > 0) {
              const dropPercent = Math.round((1 - yesterdayCount / dayBeforeCount) * 100);
              
              if (dropPercent >= dropThreshold) {
                const alert = await storage.createAlert({
                  eventId: event.id,
                  platform: platform as any,
                  eventCategory: event.category,
                  eventAction: event.action,
                  yesterdayCount,
                  dayBeforeCount,
                  dropPercent,
                  checkedAt: new Date(),
                  isResolved: false,
                });
                alertsCreated.push(alert);
              }
            }
          } catch (err) {
            console.error(`Failed to check event ${event.id} platform ${platform}:`, err);
          }
        }));
        
        completed += batch.length;
        sendProgress({ 
          status: "progress", 
          completed, 
          total: checks.length,
          alertsFound: alertsCreated.length
        });
      }
      
      sendProgress({ 
        status: "completed", 
        completed: checks.length, 
        total: checks.length,
        alertsCreated: alertsCreated.length,
        eventsChecked: eventsToMonitor.length
      });
      
      res.end();
    } catch (error: any) {
      console.error("Failed to check alerts:", error);
      sendProgress({ error: error.message || "Failed to check alerts" });
      res.end();
    }
  });

  app.post("/api/alerts/check", async (req, res) => {
    try {
      const alertConfig = await storage.getAlertSettings();
      
      if (!alertConfig || !alertConfig.isEnabled) {
        return res.status(400).json({ message: "Модуль алертов отключен" });
      }
      
      const apiUrl = alertConfig.matomoUrl || "https://analytics.sutochno.ru/index.php";
      const token = alertConfig.matomoToken || process.env.ANALYTICS_API_TOKEN;
      
      if (!token) {
        return res.status(500).json({ message: "API токен не настроен" });
      }
      
      const platformSiteMapping: Record<string, number> = {};
      if (alertConfig.matomoSiteId) {
        alertConfig.matomoSiteId.split(",").forEach(part => {
          const [platform, id] = part.trim().split(":");
          if (platform && id) {
            platformSiteMapping[platform.toLowerCase()] = parseInt(id);
          }
        });
      }
      if (Object.keys(platformSiteMapping).length === 0) {
        platformSiteMapping["web"] = 1;
        platformSiteMapping["ios"] = 2;
        platformSiteMapping["android"] = 3;
      }
      
      const dropThreshold = alertConfig.dropThreshold || 30;
      const CONCURRENCY = alertConfig.maxConcurrency || 5;
      const rateLimiter = createRateLimiter(CONCURRENCY, 200);
      
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(now);
      dayBefore.setDate(dayBefore.getDate() - 2);
      
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      const eventsToMonitor = await storage.getEventsForMonitoring();
      const platformsToCheck = Object.keys(platformSiteMapping);
      
      const checks: { event: typeof eventsToMonitor[0]; platform: string }[] = [];
      for (const event of eventsToMonitor) {
        for (const platform of platformsToCheck) {
          if (event.platforms.map(p => p.toLowerCase()).includes(platform)) {
            checks.push({ event, platform });
          }
        }
      }
      
      const alertsCreated: any[] = [];
      
      for (let i = 0; i < checks.length; i += CONCURRENCY) {
        const batch = checks.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async ({ event, platform }) => {
          const label = `${event.category} > @${event.action}`;
          const idSite = platformSiteMapping[platform] || 1;
          
          const urlYesterday = new URL(apiUrl);
          urlYesterday.searchParams.set("module", "API");
          urlYesterday.searchParams.set("format", "JSON");
          urlYesterday.searchParams.set("idSite", String(idSite));
          urlYesterday.searchParams.set("period", "day");
          urlYesterday.searchParams.set("date", yesterdayStr);
          urlYesterday.searchParams.set("method", "Events.getCategory");
          urlYesterday.searchParams.set("label", label);
          urlYesterday.searchParams.set("filter_limit", "100");
          urlYesterday.searchParams.set("token_auth", token);
          
          const urlDayBefore = new URL(apiUrl);
          urlDayBefore.searchParams.set("module", "API");
          urlDayBefore.searchParams.set("format", "JSON");
          urlDayBefore.searchParams.set("idSite", String(idSite));
          urlDayBefore.searchParams.set("period", "day");
          urlDayBefore.searchParams.set("date", dayBeforeStr);
          urlDayBefore.searchParams.set("method", "Events.getCategory");
          urlDayBefore.searchParams.set("label", label);
          urlDayBefore.searchParams.set("filter_limit", "100");
          urlDayBefore.searchParams.set("token_auth", token);
          
          try {
            await rateLimiter.acquire();
            const [resYesterday, resDayBefore] = await Promise.all([
              fetchWithTimeout(urlYesterday.toString(), { timeout: 30000 }),
              fetchWithTimeout(urlDayBefore.toString(), { timeout: 30000 })
            ]).finally(() => rateLimiter.release());
            
            if (!resYesterday.ok || !resDayBefore.ok) return;
            
            const dataYesterday = await resYesterday.json();
            const dataDayBefore = await resDayBefore.json();
            
            let yesterdayCount = 0;
            let dayBeforeCount = 0;
            
            if (Array.isArray(dataYesterday) && dataYesterday.length > 0) {
              yesterdayCount = dataYesterday[0]?.nb_events || 0;
            } else if (dataYesterday && typeof dataYesterday === 'object') {
              yesterdayCount = dataYesterday.nb_events || 0;
            }
            
            if (Array.isArray(dataDayBefore) && dataDayBefore.length > 0) {
              dayBeforeCount = dataDayBefore[0]?.nb_events || 0;
            } else if (dataDayBefore && typeof dataDayBefore === 'object') {
              dayBeforeCount = dataDayBefore.nb_events || 0;
            }
            
            if (dayBeforeCount > 0) {
              const dropPercent = Math.round((1 - yesterdayCount / dayBeforeCount) * 100);
              
              if (dropPercent >= dropThreshold) {
                const alert = await storage.createAlert({
                  eventId: event.id,
                  platform: platform as any,
                  eventCategory: event.category,
                  eventAction: event.action,
                  yesterdayCount,
                  dayBeforeCount,
                  dropPercent,
                  checkedAt: new Date(),
                  isResolved: false,
                });
                alertsCreated.push(alert);
              }
            }
          } catch (err) {
            console.error(`Failed to check event ${event.id} platform ${platform}:`, err);
          }
        }));
      }
      
      res.json({
        message: `Проверка завершена. Создано алертов: ${alertsCreated.length}.`,
        alertsCreated: alertsCreated.length,
        eventsChecked: eventsToMonitor.length,
      });
    } catch (error: any) {
      console.error("Failed to check alerts:", error);
      res.status(500).json({ message: error.message || "Failed to check alerts" });
    }
  });
}
