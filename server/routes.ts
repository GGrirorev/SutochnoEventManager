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

      const input = api.events.update.input.parse(req.body);
      const event = await storage.updateEvent(id, input);
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

  // Event Platform Statuses API
  app.get("/api/events/:eventId/platform-statuses", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const statuses = await storage.getEventPlatformStatuses(eventId);
    
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
        platformStatuses[validated.platform] = {
          implementationStatus: validated.implementationStatus,
          validationStatus: validated.validationStatus,
          implementationHistory: [],
          validationHistory: []
        };
        const platformJiraLinks = { ...(event.platformJiraLinks || {}) };
        if (validated.jiraLink) {
          platformJiraLinks[validated.platform] = validated.jiraLink;
        }
        await storage.updateEvent(eventId, { platformStatuses, platformJiraLinks });
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
      
      // Validate input with Zod
      const validated = updatePlatformStatusSchema.parse(req.body);
      
      const existing = await storage.getEventPlatformStatus(eventId, platform);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found" });
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
        await storage.updateEvent(eventId, { platformStatuses, platformJiraLinks });
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
