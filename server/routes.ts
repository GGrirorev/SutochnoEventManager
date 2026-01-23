import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { PLATFORMS, IMPLEMENTATION_STATUS, VALIDATION_STATUS, insertEventPlatformStatusSchema, insertStatusHistorySchema } from "@shared/schema";

// Zod schemas for platform status API validation
const createPlatformStatusSchema = z.object({
  platform: z.enum(PLATFORMS),
  jiraLink: z.string().optional(),
  implementationStatus: z.enum(IMPLEMENTATION_STATUS).default("черновик"),
  validationStatus: z.enum(VALIDATION_STATUS).default("ожидает_проверки"),
});

const updatePlatformStatusSchema = z.object({
  jiraLink: z.string().optional(),
  implementationStatus: z.enum(IMPLEMENTATION_STATUS).optional(),
  validationStatus: z.enum(VALIDATION_STATUS).optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.events.list.path, async (req, res) => {
    try {
      // Manual query param extraction since Zod is used for validation but express query params are strings
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        platform: req.query.platform as string | undefined,
        status: req.query.status as string | undefined,
      };
      
      const events = await storage.getEvents(filters);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get(api.events.get.path, async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  });

  app.post(api.events.create.path, async (req, res) => {
    try {
      const input = api.events.create.input.parse(req.body);
      const event = await storage.createEvent(input);
      
      // Create initial version (v1)
      await storage.createEventVersion({
        eventId: event.id,
        version: 1,
        category: event.category,
        block: event.block || "",
        action: event.action,
        actionDescription: event.actionDescription || "",
        name: event.name,
        valueDescription: event.valueDescription || "",
        owner: event.owner,
        platforms: event.platforms || [],
        platformJiraLinks: event.platformJiraLinks || {},
        platformStatuses: {},
        implementationStatus: "черновик",
        validationStatus: "ожидает_проверки",
        properties: event.properties || [],
        notes: event.notes,
        changeDescription: "Начальная версия",
      });
      
      // Create platform statuses for version 1
      const platforms = event.platforms || [];
      if (platforms.length > 0) {
        await storage.createVersionPlatformStatuses(event.id, 1, platforms);
      }
      
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.events.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const { changeDescription, ...updateData } = req.body;
      const input = api.events.update.input.parse(updateData);
      
      // Increment version
      const newVersion = (existing.currentVersion || 1) + 1;
      const event = await storage.updateEvent(id, { 
        ...input, 
        currentVersion: newVersion 
      });
      
      // Create new version snapshot
      await storage.createEventVersion({
        eventId: event.id,
        version: newVersion,
        category: event.category,
        block: event.block || "",
        action: event.action,
        actionDescription: event.actionDescription || "",
        name: event.name,
        valueDescription: event.valueDescription || "",
        owner: event.owner,
        platforms: event.platforms || [],
        platformJiraLinks: event.platformJiraLinks || {},
        platformStatuses: {}, // New version starts with empty/fresh statuses
        implementationStatus: "черновик", // Default for new version
        validationStatus: "ожидает_проверки", // Default for new version
        properties: event.properties || [],
        notes: event.notes,
        changeDescription: changeDescription || `Обновление до версии ${newVersion}`,
      });
      
      // Create new platform statuses for the new version with default values
      const platforms = event.platforms || [];
      if (platforms.length > 0) {
        await storage.createVersionPlatformStatuses(event.id, newVersion, platforms);
      }
      
      res.json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.events.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getEvent(id);
    if (!existing) {
      return res.status(404).json({ message: 'Event not found' });
    }
    await storage.deleteEvent(id);
    res.status(204).send();
  });

  app.get(api.events.stats.path, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.get("/api/events/:id/comments", async (req, res) => {
    const comments = await storage.getComments(Number(req.params.id));
    res.json(comments);
  });

  app.post("/api/events/:id/comments", async (req, res) => {
    const eventId = Number(req.params.id);
    const comment = await storage.createComment({
      eventId,
      content: req.body.content,
      author: req.body.author || "Аноним"
    });
    res.status(201).json(comment);
  });

  // Property Templates API
  app.get("/api/property-templates", async (req, res) => {
    const category = req.query.category as string | undefined;
    const templates = await storage.getPropertyTemplates(category);
    res.json(templates);
  });

  app.get("/api/property-templates/next-dimension", async (req, res) => {
    const nextDimension = await storage.getNextDimension();
    res.json({ nextDimension });
  });

  app.get("/api/property-templates/:id", async (req, res) => {
    const template = await storage.getPropertyTemplate(Number(req.params.id));
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  app.post("/api/property-templates", async (req, res) => {
    try {
      const template = await storage.createPropertyTemplate(req.body);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create template" });
    }
  });

  app.patch("/api/property-templates/:id", async (req, res) => {
    try {
      const template = await storage.updatePropertyTemplate(Number(req.params.id), req.body);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update template" });
    }
  });

  app.delete("/api/property-templates/:id", async (req, res) => {
    await storage.deletePropertyTemplate(Number(req.params.id));
    res.status(204).send();
  });

  // Event Platform Statuses API (version-aware)
  app.get("/api/events/:eventId/platform-statuses", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const versionNumber = req.query.version ? Number(req.query.version) : undefined;
    
    const statuses = await storage.getEventPlatformStatuses(eventId, versionNumber);
    
    // Also fetch history for each status
    const statusesWithHistory = await Promise.all(statuses.map(async (status) => {
      const history = await storage.getStatusHistory(status.id);
      return { ...status, history };
    }));
    
    res.json(statusesWithHistory);
  });

  app.post("/api/events/:eventId/platform-statuses", async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      
      // Validate input with Zod
      const validated = createPlatformStatusSchema.parse(req.body);
      
      // Check if status for this platform already exists
      const existing = await storage.getEventPlatformStatus(eventId, validated.platform);
      if (existing) {
        return res.status(400).json({ message: "Status for this platform already exists" });
      }
      
      const status = await storage.createEventPlatformStatus({
        eventId,
        platform: validated.platform,
        jiraLink: validated.jiraLink,
        implementationStatus: validated.implementationStatus,
        validationStatus: validated.validationStatus
      });
      
      // Create initial history entries
      await storage.createStatusHistory({
        eventPlatformStatusId: status.id,
        statusType: "implementation",
        oldStatus: null,
        newStatus: status.implementationStatus
      });
      await storage.createStatusHistory({
        eventPlatformStatusId: status.id,
        statusType: "validation",
        oldStatus: null,
        newStatus: status.validationStatus
      });
      
      // Sync to legacy JSONB field for backwards compatibility
      const event = await storage.getEvent(eventId);
      if (event) {
        const platformStatuses = { ...(event.platformStatuses || {}) };
        const timestamp = new Date().toISOString();
        platformStatuses[validated.platform] = {
          implementationStatus: validated.implementationStatus,
          validationStatus: validated.validationStatus,
          implementationHistory: [{ status: validated.implementationStatus, timestamp }],
          validationHistory: [{ status: validated.validationStatus, timestamp }]
        };
        const platformJiraLinks = { ...(event.platformJiraLinks || {}) };
        if (validated.jiraLink) {
          platformJiraLinks[validated.platform] = validated.jiraLink;
        }
        // Ensure platform is in the platforms array
        const platforms = [...(event.platforms || [])];
        if (!platforms.includes(validated.platform)) {
          platforms.push(validated.platform);
        }
        await storage.updateEvent(eventId, { platformStatuses, platformJiraLinks, platforms });
      }
      
      res.status(201).json(status);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create platform status" });
    }
  });

  app.patch("/api/events/:eventId/platform-statuses/:platform", async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform;
      const versionNumber = req.body.versionNumber ? Number(req.body.versionNumber) : undefined;
      
      // Validate input with Zod
      const validated = updatePlatformStatusSchema.parse(req.body);
      
      // Get current event to determine default version
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const targetVersion = versionNumber || event.currentVersion;
      const existing = await storage.getEventPlatformStatus(eventId, platform, targetVersion);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found for this version" });
      }
      
      // Track status changes in history
      if (validated.implementationStatus && validated.implementationStatus !== existing.implementationStatus) {
        await storage.createStatusHistory({
          eventPlatformStatusId: existing.id,
          statusType: "implementation",
          oldStatus: existing.implementationStatus,
          newStatus: validated.implementationStatus
        });
      }
      
      if (validated.validationStatus && validated.validationStatus !== existing.validationStatus) {
        await storage.createStatusHistory({
          eventPlatformStatusId: existing.id,
          statusType: "validation",
          oldStatus: existing.validationStatus,
          newStatus: validated.validationStatus
        });
      }
      
      const updates: Record<string, string | undefined> = {};
      if (validated.jiraLink !== undefined) updates.jiraLink = validated.jiraLink;
      if (validated.implementationStatus) updates.implementationStatus = validated.implementationStatus;
      if (validated.validationStatus) updates.validationStatus = validated.validationStatus;
      
      const status = await storage.updateEventPlatformStatus(existing.id, updates);
      
      // Sync to legacy JSONB field for backwards compatibility
      const event = await storage.getEvent(eventId);
      if (event) {
        const platformStatuses = { ...(event.platformStatuses || {}) };
        const existingPlatformStatus = platformStatuses[platform] || {
          implementationHistory: [],
          validationHistory: []
        };
        
        // Add history entry if status changed
        const implementationHistory = [...(existingPlatformStatus.implementationHistory || [])];
        const validationHistory = [...(existingPlatformStatus.validationHistory || [])];
        
        if (validated.implementationStatus && validated.implementationStatus !== existing.implementationStatus) {
          implementationHistory.push({
            status: validated.implementationStatus,
            timestamp: new Date().toISOString()
          });
        }
        
        if (validated.validationStatus && validated.validationStatus !== existing.validationStatus) {
          validationHistory.push({
            status: validated.validationStatus,
            timestamp: new Date().toISOString()
          });
        }
        
        platformStatuses[platform] = {
          implementationStatus: validated.implementationStatus || existing.implementationStatus,
          validationStatus: validated.validationStatus || existing.validationStatus,
          implementationHistory,
          validationHistory
        };
        const platformJiraLinks = { ...(event.platformJiraLinks || {}) };
        if (validated.jiraLink !== undefined) {
          platformJiraLinks[platform] = validated.jiraLink;
        }
        // Ensure platform is in the platforms array
        const platforms = [...(event.platforms || [])];
        if (!platforms.includes(platform)) {
          platforms.push(platform);
        }
        await storage.updateEvent(eventId, { platformStatuses, platformJiraLinks, platforms });
      }
      
      res.json(status);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update platform status" });
    }
  });

  app.delete("/api/events/:eventId/platform-statuses/:platform", async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform;
      
      const existing = await storage.getEventPlatformStatus(eventId, platform);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found" });
      }
      
      // Delete the platform status (this will cascade delete history via foreign key or we handle it)
      await storage.deletePlatformStatus(existing.id);
      
      // Sync to legacy JSONB field for backwards compatibility
      const event = await storage.getEvent(eventId);
      if (event) {
        const platformStatuses = { ...(event.platformStatuses || {}) };
        delete platformStatuses[platform];
        const platformJiraLinks = { ...(event.platformJiraLinks || {}) };
        delete platformJiraLinks[platform];
        // Also update the platforms array to remove this platform
        const platforms = (event.platforms || []).filter(p => p !== platform);
        await storage.updateEvent(eventId, { platformStatuses, platformJiraLinks, platforms });
      }
      
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to delete platform status" });
    }
  });

  // Status History API
  app.get("/api/platform-statuses/:statusId/history", async (req, res) => {
    const statusId = Number(req.params.statusId);
    const history = await storage.getStatusHistory(statusId);
    res.json(history);
  });

  // Event Versions API
  app.get("/api/events/:eventId/versions", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const versions = await storage.getEventVersions(eventId);
    res.json(versions);
  });

  app.get("/api/events/:eventId/versions/:version", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const version = Number(req.params.version);
    const eventVersion = await storage.getEventVersion(eventId, version);
    if (!eventVersion) {
      return res.status(404).json({ message: "Version not found" });
    }
    res.json(eventVersion);
  });

  // Analytics API - proxy to Matomo/Piwik analytics
  const analyticsQuerySchema = z.object({
    label: z.string().min(1, "Label parameter is required"),
    platform: z.enum(["web", "ios", "android"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.get("/api/analytics/events", async (req, res) => {
    try {
      const validated = analyticsQuerySchema.safeParse(req.query);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid parameters" });
      }
      
      const { label, platform, startDate, endDate } = validated.data;
      
      // Map platform name to idSite
      const platformToSiteId: Record<string, number> = {
        "web": 1,
        "ios": 2,
        "android": 3
      };
      
      const idSite = platform ? platformToSiteId[platform] : 1;
      const dateRange = `${startDate || '2025-11-24'},${endDate || new Date().toISOString().split('T')[0]}`;
      
      const token = process.env.ANALYTICS_API_TOKEN;
      if (!token) {
        return res.status(500).json({ message: "Analytics API token not configured" });
      }
      
      const url = new URL("https://analytics.sutochno.ru/index.php");
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
      if (data && typeof data === 'object' && data.result === 'error') {
        return res.status(502).json({ message: data.message || "Analytics API error" });
      }
      
      res.json(data);
    } catch (error: any) {
      console.error("Analytics API error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics data" });
    }
  });

  // Initial seed data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getEvents();
  if (existing.length > 0) return;

  const sampleEvents = [
    {
      category: "Авторизация",
      action: "finish_signup",
      actionDescription: "Пользователь успешно завершил процесс регистрации, заполнив все поля",
      name: "signup_completed",
      value: 1,
      valueDescription: "Количество успешных регистраций",
      platforms: ["все"],
      implementationStatus: "внедрено",
      validationStatus: "корректно",
      owner: "Команда Авторизации",
      properties: [
        { name: "userId", type: "string", required: true, description: "Уникальный идентификатор пользователя" },
        { name: "method", type: "string", required: true, description: "email, google или apple" },
        { name: "platform", type: "string", required: true, description: "web, ios или android" }
      ]
    },
    {
      category: "E-commerce",
      action: "click_checkout",
      actionDescription: "Нажатие на кнопку оформления заказа в корзине",
      name: "checkout_started",
      value: 100,
      valueDescription: "Предварительная стоимость корзины",
      platforms: ["web", "ios", "android"],
      implementationStatus: "в_разработке",
      validationStatus: "ожидает_проверки",
      owner: "Команда Оформления",
      properties: [
        { name: "cartValue", type: "number", required: true, description: "Общая стоимость корзины" },
        { name: "itemCount", type: "number", required: true, description: "Количество товаров" }
      ]
    },
    {
      category: "Стабильность",
      action: "crash",
      actionDescription: "Автоматическое событие при возникновении критического исключения",
      name: "app_crashed",
      value: -1,
      valueDescription: "Код ошибки",
      platforms: ["ios", "android"],
      implementationStatus: "внедрено",
      validationStatus: "ошибка",
      owner: "Платформенная команда",
      notes: "В данный момент отсутствует свойство stack trace в продакшене",
      properties: [
        { name: "screen", type: "string", required: true, description: "Экран, где произошло падение" },
        { name: "version", type: "string", required: true, description: "Версия приложения" }
      ]
    }
  ];

  for (const event of sampleEvents) {
    // @ts-ignore
    await storage.createEvent(event);
  }
}
