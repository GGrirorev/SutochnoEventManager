import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  PLATFORMS,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS,
  insertCommentSchema,
  insertPropertyTemplateSchema,
} from "@shared/schema";
import { requireAuth, requirePermission, requireAdmin, AuthenticatedRequest } from "./middleware";

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
  statusComment: z.string().optional(),
  statusJiraLink: z.string().optional(),
});

const createCommentSchema = insertCommentSchema
  .pick({ content: true, author: true })
  .partial({ author: true });

const createPropertyTemplateSchema = insertPropertyTemplateSchema;
const updatePropertyTemplateSchema = insertPropertyTemplateSchema.partial();

export function registerEventRoutes(app: Express): void {
  app.get(api.events.list.path, requireAuth, requirePermission("canViewEvents"), async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        platform: req.query.platform as string | undefined,
        ownerId: req.query.ownerId ? parseInt(req.query.ownerId as string, 10) : undefined,
        authorId: req.query.authorId ? parseInt(req.query.authorId as string, 10) : undefined,
        implementationStatus: req.query.implementationStatus as string | undefined,
        validationStatus: req.query.validationStatus as string | undefined,
        jira: req.query.jira as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };
      
      const result = await storage.getEvents(filters);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get(api.events.get.path, requireAuth, requirePermission("canViewEvents"), async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  });

  app.post(api.events.create.path, requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { category: categoryName, ...inputData } = req.body;
      const input = api.events.create.input.parse({ ...inputData, category: categoryName });
      const platforms = input.platforms || [];
      const authorId = (req as AuthenticatedRequest).user?.id;
      
      const trimmedCategoryName = (categoryName || "").trim();
      if (!trimmedCategoryName) {
        return res.status(400).json({ message: "Event Category обязательна", field: "category" });
      }
      
      const duplicate = await storage.checkEventExistsByCategoryAction(trimmedCategoryName, input.action);
      if (duplicate) {
        return res.status(400).json({ 
          message: `Событие с категорией "${trimmedCategoryName}" и action "${input.action}" уже существует`, 
          field: "action" 
        });
      }
      
      const event = await storage.createEventWithVersionAndStatuses(
        { ...inputData, authorId },
        {
          version: 1,
          block: input.block || "",
          action: input.action,
          actionDescription: input.actionDescription || "",
          name: input.name,
          valueDescription: input.valueDescription || "",
          ownerId: input.ownerId,
          platforms: platforms,
          properties: input.properties || [],
          notes: input.notes,
          changeDescription: "Начальная версия",
          authorId,
        },
        platforms,
        trimmedCategoryName
      );
      
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

  app.patch(api.events.update.path, requireAuth, requirePermission("canEditEvents"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const { changeDescription, category: categoryName, ...updateData } = req.body;
      const input = api.events.update.input.parse({ ...updateData, category: categoryName });
      const versionAuthorId = (req as AuthenticatedRequest).user?.id;
      
      const trimmedCategoryName = (categoryName || "").trim();
      if (!trimmedCategoryName) {
        return res.status(400).json({ message: "Event Category обязательна", field: "category" });
      }
      
      const platforms = input.platforms || [];
      const currentVersionData = await storage.getEventVersion(id, existing.currentVersion || 1);
      
      const categoryChanged = existing.category !== trimmedCategoryName;
      const actionChanged = existing.action !== input.action;
      const nameChanged = existing.name !== input.name;
      const valueDescriptionChanged = existing.valueDescription !== (input.valueDescription || "");
      const propertiesChanged = JSON.stringify(existing.properties || []) !== JSON.stringify(input.properties || []);
      
      const requiresNewVersion = categoryChanged || actionChanged || nameChanged || valueDescriptionChanged || propertiesChanged;
      
      let event;
      
      if (requiresNewVersion) {
        const newVersion = (existing.currentVersion || 1) + 1;
        
        event = await storage.updateEventWithVersionAndStatuses(
          id,
          { ...updateData, currentVersion: newVersion },
          {
            version: newVersion,
            block: input.block || "",
            action: input.action || existing.action,
            actionDescription: input.actionDescription || "",
            name: input.name,
            valueDescription: input.valueDescription || "",
            ownerId: input.ownerId,
            platforms: platforms,
            properties: input.properties || [],
            notes: input.notes,
            changeDescription: changeDescription || `Обновление до версии ${newVersion}`,
            authorId: versionAuthorId,
          },
          platforms,
          trimmedCategoryName
        );
      } else {
        event = await storage.updateEventWithoutNewVersion(
          id,
          {
            ...updateData,
            block: input.block || "",
            actionDescription: input.actionDescription || "",
            ownerId: input.ownerId,
            platforms: platforms,
            notes: input.notes,
          },
          existing.currentVersion || 1,
          trimmedCategoryName
        );
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

  app.delete(api.events.delete.path, requireAuth, requirePermission("canDeleteEvents"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getEvent(id);
    if (!existing) {
      return res.status(404).json({ message: 'Event not found' });
    }
    await storage.deleteEventWithRelatedData(id);
    res.status(204).send();
  });

  app.get(api.events.stats.path, requireAuth, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.post("/api/events/import/preview", requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { events } = req.body as { events: Array<{
        platforms: string[];
        block: string;
        actionDescription: string;
        category: string;
        action: string;
        name: string;
        valueDescription: string;
        properties: { name: string; type: string; required: boolean; description: string }[];
      }> };

      const newEvents: typeof events = [];
      const existingEvents: Array<{ parsed: typeof events[0]; existingId: number; existingVersion: number }> = [];
      const errors: string[] = [];

      const validEvents = events.filter(event => {
        if (!event.category || !event.action) {
          errors.push(`Событие без category или action пропущено`);
          return false;
        }
        return true;
      });

      const existingMap = await storage.checkEventsExistBatch(
        validEvents.map(e => ({ category: e.category, action: e.action }))
      );

      for (const event of validEvents) {
        const key = `${event.category}:${event.action}`;
        const existing = existingMap.get(key);

        if (existing) {
          existingEvents.push({
            parsed: event,
            existingId: existing.id,
            existingVersion: existing.currentVersion
          });
        } else {
          newEvents.push(event);
        }
      }

      res.json({ newEvents, existingEvents, errors });
    } catch (err) {
      console.error("Import preview error:", err);
      const message = err instanceof Error ? err.message : "Ошибка при анализе файла";
      res.status(500).json({ message });
    }
  });

  app.post("/api/events/import", requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { newEvents, updateEvents } = req.body as {
        newEvents: Array<{
          platforms: string[];
          block: string;
          actionDescription: string;
          category: string;
          action: string;
          name: string;
          valueDescription: string;
          properties: { name: string; type: string; required: boolean; description: string }[];
        }>;
        updateEvents: Array<{
          parsed: {
            platforms: string[];
            block: string;
            actionDescription: string;
            category: string;
            action: string;
            name: string;
            valueDescription: string;
            properties: { name: string; type: string; required: boolean; description: string }[];
          };
          existingId: number;
        }>;
      };

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];
      const authorId = (req as AuthenticatedRequest).user?.id;

      for (const event of newEvents) {
        try {
          await storage.createEventWithVersionAndStatuses(
            {
              category: event.category,
              action: event.action,
              name: event.name || "",
              block: event.block || "",
              actionDescription: event.actionDescription || "",
              valueDescription: event.valueDescription || "",
              platforms: event.platforms,
              properties: event.properties,
              ownerId: null,
              authorId,
              notes: null,
              currentVersion: 1,
            },
            {
              version: 1,
              action: event.action,
              name: event.name || null,
              block: event.block || "",
              actionDescription: event.actionDescription || "",
              valueDescription: event.valueDescription || "",
              platforms: event.platforms,
              properties: event.properties,
              ownerId: null,
              notes: null,
              changeDescription: "Импорт из CSV",
              authorId,
            },
            event.platforms,
            event.category
          );
          created++;
        } catch (err) {
          errors.push(`Ошибка создания ${event.category}/${event.action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      for (const { parsed, existingId } of updateEvents) {
        try {
          const existing = await storage.getEvent(existingId);
          if (!existing) {
            skipped++;
            continue;
          }

          const newVersion = (existing.currentVersion || 1) + 1;
          await storage.updateEventWithVersionAndStatuses(
            existingId,
            {
              category: parsed.category,
              action: parsed.action,
              name: parsed.name || "",
              block: parsed.block || "",
              actionDescription: parsed.actionDescription || "",
              valueDescription: parsed.valueDescription || "",
              platforms: parsed.platforms,
              properties: parsed.properties,
              currentVersion: newVersion,
            },
            {
              version: newVersion,
              action: parsed.action,
              name: parsed.name || "",
              block: parsed.block || "",
              actionDescription: parsed.actionDescription || "",
              valueDescription: parsed.valueDescription || "",
              platforms: parsed.platforms,
              properties: parsed.properties,
              ownerId: existing.ownerId,
              notes: existing.notes,
              changeDescription: "Обновление из CSV импорта",
              authorId,
            },
            parsed.platforms,
            parsed.category
          );
          updated++;
        } catch (err) {
          errors.push(`Ошибка обновления ${parsed.category}/${parsed.action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      res.json({ created, updated, skipped, errors });
    } catch (err) {
      res.status(500).json({ message: "Ошибка импорта" });
    }
  });

  app.get("/api/events/:id/comments", requireAuth, async (req, res) => {
    const comments = await storage.getComments(Number(req.params.id));
    res.json(comments);
  });

  app.post("/api/events/:id/comments", requireAuth, requirePermission("canComment"), async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const user = (req as AuthenticatedRequest).user;
      const input = createCommentSchema.parse(req.body);
      const comment = await storage.createComment({
        eventId,
        content: input.content,
        author: user?.name || input.author || "Аноним",
      });
      res.status(201).json(comment);
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

  app.delete("/api/comments/:id", requireAuth, requireAdmin, async (req, res) => {
    await storage.deleteComment(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/property-templates", requireAuth, async (req, res) => {
    const category = req.query.category as string | undefined;
    const templates = await storage.getPropertyTemplates(category);
    res.json(templates);
  });

  app.get("/api/property-templates/next-dimension", requireAuth, async (req, res) => {
    const nextDimension = await storage.getNextDimension();
    res.json({ nextDimension });
  });

  app.get("/api/property-templates/:id", requireAuth, async (req, res) => {
    const template = await storage.getPropertyTemplate(Number(req.params.id));
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  app.post("/api/property-templates", requireAuth, requirePermission("canManageProperties"), async (req, res) => {
    try {
      const input = createPropertyTemplateSchema.parse(req.body);
      const template = await storage.createPropertyTemplate(input);
      res.status(201).json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join('.'),
        });
      }
      res.status(400).json({ message: error.message || "Failed to create template" });
    }
  });

  app.patch("/api/property-templates/:id", requireAuth, requirePermission("canManageProperties"), async (req, res) => {
    try {
      const input = updatePropertyTemplateSchema.parse(req.body);
      const template = await storage.updatePropertyTemplate(Number(req.params.id), input);
      res.json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join('.'),
        });
      }
      res.status(400).json({ message: error.message || "Failed to update template" });
    }
  });

  app.delete("/api/property-templates/:id", requireAuth, requirePermission("canManageProperties"), async (req, res) => {
    await storage.deletePropertyTemplate(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/events/:eventId/platform-statuses", requireAuth, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const versionNumber = req.query.version ? Number(req.query.version) : undefined;
    
    const statuses = await storage.getEventPlatformStatuses(eventId, versionNumber);
    
    // Batch fetch all histories in a single query (optimization: 2 queries instead of N+1)
    const statusIds = statuses.map(s => s.id);
    const historiesMap = await storage.getStatusHistoryBatch(statusIds);
    
    const statusesWithHistory = statuses.map(status => ({
      ...status,
      history: historiesMap.get(status.id) || []
    }));
    
    res.json(statusesWithHistory);
  });

  app.post("/api/events/:eventId/platform-statuses", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const validated = createPlatformStatusSchema.parse(req.body);
      
      const existing = await storage.getEventPlatformStatus(eventId, validated.platform, 1);
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
      
      const event = await storage.getEvent(eventId);
      if (event) {
        const platforms = [...(event.platforms || [])];
        if (!platforms.includes(validated.platform)) {
          platforms.push(validated.platform);
          await storage.updateEvent(eventId, { platforms });
        }
      }
      
      res.status(201).json(status);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create platform status" });
    }
  });

  app.patch("/api/events/:eventId/platform-statuses/:platform", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform;
      const versionNumber = req.body.versionNumber ? Number(req.body.versionNumber) : undefined;
      const user = (req as AuthenticatedRequest).user;
      
      const validated = updatePlatformStatusSchema.parse(req.body);
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const targetVersion = versionNumber || event.currentVersion;
      const existing = await storage.getEventPlatformStatus(eventId, platform as string, targetVersion);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found for this version" });
      }
      
      if (validated.implementationStatus && validated.implementationStatus !== existing.implementationStatus) {
        await storage.createStatusHistory({
          eventPlatformStatusId: existing.id,
          statusType: "implementation",
          oldStatus: existing.implementationStatus,
          newStatus: validated.implementationStatus,
          changedByUserId: user.id,
          comment: validated.statusComment || null,
          jiraLink: validated.statusJiraLink || null
        });
      }
      
      if (validated.validationStatus && validated.validationStatus !== existing.validationStatus) {
        await storage.createStatusHistory({
          eventPlatformStatusId: existing.id,
          statusType: "validation",
          oldStatus: existing.validationStatus,
          newStatus: validated.validationStatus,
          changedByUserId: user.id,
          comment: validated.statusComment || null,
          jiraLink: validated.statusJiraLink || null
        });
      }
      
      const updates: Record<string, string | undefined> = {};
      if (validated.jiraLink !== undefined) updates.jiraLink = validated.jiraLink;
      if (validated.implementationStatus) updates.implementationStatus = validated.implementationStatus;
      if (validated.validationStatus) updates.validationStatus = validated.validationStatus;
      
      const status = await storage.updateEventPlatformStatus(existing.id, updates);
      
      res.json(status);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update platform status" });
    }
  });

  app.delete("/api/events/:eventId/platform-statuses/:platform", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform as string;
      
      const existing = await storage.getEventPlatformStatus(eventId, platform, 1);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found" });
      }
      
      await storage.deletePlatformStatus(existing.id);
      
      const event = await storage.getEvent(eventId);
      if (event) {
        const platforms = (event.platforms || []).filter(p => p !== platform);
        await storage.updateEvent(eventId, { platforms });
      }
      
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to delete platform status" });
    }
  });

  app.get("/api/platform-statuses/:statusId/history", requireAuth, async (req, res) => {
    const statusId = Number(req.params.statusId);
    const history = await storage.getStatusHistory(statusId);
    res.json(history);
  });

  app.get("/api/events/:eventId/versions", requireAuth, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const versions = await storage.getEventVersions(eventId);
    res.json(versions);
  });

  app.get("/api/events/:eventId/versions/:version", requireAuth, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const version = Number(req.params.version);
    const eventVersion = await storage.getEventVersion(eventId, version);
    if (!eventVersion) {
      return res.status(404).json({ message: "Version not found" });
    }
    res.json(eventVersion);
  });
}
