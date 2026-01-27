import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcrypt";
import {
  PLATFORMS,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS,
  insertCommentSchema,
  insertEventPlatformStatusSchema,
  insertPropertyTemplateSchema,
  insertStatusHistorySchema,
  loginSchema,
  ROLE_PERMISSIONS,
  UserRole,
} from "@shared/schema";

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
  statusComment: z.string().optional(),
  statusJiraLink: z.string().optional(),
});

const createCommentSchema = insertCommentSchema
  .pick({
    content: true,
    author: true,
  })
  .partial({ author: true });

const createPropertyTemplateSchema = insertPropertyTemplateSchema;
const updatePropertyTemplateSchema = insertPropertyTemplateSchema.partial();

// CSRF protection middleware for state-changing requests
// Validates Origin/Referer header and Content-Type for cookie-based sessions
const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Only check state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // For state-changing requests, require either Origin or Referer header
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  const host = req.get('Host');
  
  // Must have at least Origin or Referer for all state-changing browser requests
  // This protects against CSRF even for login/setup endpoints
  if (!origin && !referer) {
    console.warn('CSRF: Missing Origin/Referer for state-changing request to', req.path);
    return res.status(403).json({ message: "Missing Origin or Referer header" });
  }
  
  // Validate Origin if present
  if (origin) {
    try {
      const originUrl = new URL(origin);
      // In development, allow localhost and Replit domains
      const isAllowed = originUrl.hostname === 'localhost' || 
                       originUrl.hostname === '127.0.0.1' ||
                       originUrl.hostname.endsWith('.replit.dev') ||
                       originUrl.hostname.endsWith('.repl.co') ||
                       originUrl.hostname.endsWith('.replit.app');
      
      // In production, strictly compare origin with host
      if (!isAllowed && host && !origin.includes(host)) {
        console.warn(`CSRF blocked: Origin ${origin} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid origin" });
    }
  }
  
  // Validate Referer if Origin not present
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer);
      const isAllowed = refererUrl.hostname === 'localhost' || 
                       refererUrl.hostname === '127.0.0.1' ||
                       refererUrl.hostname.endsWith('.replit.dev') ||
                       refererUrl.hostname.endsWith('.repl.co') ||
                       refererUrl.hostname.endsWith('.replit.app');
      
      if (!isAllowed && host && !referer.includes(host)) {
        console.warn(`CSRF blocked: Referer ${referer} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid referer" });
    }
  }
  
  // Validate Content-Type for requests with body
  if (req.body && Object.keys(req.body).length > 0) {
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(403).json({ message: "Content-Type must be application/json" });
    }
  }
  
  next();
};

// Authentication middleware - requires valid session
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Сессия недействительна" });
  }
  
  // Attach user to request for downstream use
  (req as any).user = user;
  next();
};

// Role-based access control middleware factory
const requirePermission = (permission: keyof typeof ROLE_PERMISSIONS.admin) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ message: "Требуется авторизация" });
    }
    
    const userPermissions = ROLE_PERMISSIONS[user.role as UserRole];
    if (!userPermissions || !userPermissions[permission]) {
      return res.status(403).json({ message: "Недостаточно прав для выполнения операции" });
    }
    
    next();
  };
};

// Admin-only middleware (shortcut)
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Доступ только для администраторов" });
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Apply CSRF protection globally for all state-changing requests
  app.use(csrfProtection);
  
  // Categories API
  app.get("/api/categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Category name is required" });
      }
      const category = await storage.getOrCreateCategory(name.trim());
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Failed to create category" });
    }
  });
  
  // Events - Read (requires auth + canViewEvents)
  app.get(api.events.list.path, requireAuth, requirePermission("canViewEvents"), async (req, res) => {
    try {
      // Manual query param extraction since Zod is used for validation but express query params are strings
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        platform: req.query.platform as string | undefined,
        status: req.query.status as string | undefined,
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

  // Events - Create (requires auth + canCreateEvents)
  app.post(api.events.create.path, requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { category: categoryName, ...inputData } = req.body;
      const input = api.events.create.input.parse({ ...inputData, category: categoryName });
      const platforms = input.platforms || [];
      const authorId = (req as any).user?.id;
      
      // Validate category name
      const trimmedCategoryName = (categoryName || "").trim();
      if (!trimmedCategoryName) {
        return res.status(400).json({ message: "Event Category обязательна", field: "category" });
      }
      
      // Atomic transaction: create category + event + version + platform statuses
      const event = await storage.createEventWithVersionAndStatuses(
        { ...inputData, authorId },
        {
          version: 1,
          block: input.block || "",
          action: input.action,
          actionDescription: input.actionDescription || "",
          name: input.name,
          valueDescription: input.valueDescription || "",
          owner: input.owner,
          platforms: platforms,
          implementationStatus: "черновик",
          validationStatus: "ожидает_проверки",
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

  // Events - Update (requires auth + canEditEvents)
  app.patch(api.events.update.path, requireAuth, requirePermission("canEditEvents"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const { changeDescription, category: categoryName, ...updateData } = req.body;
      const input = api.events.update.input.parse({ ...updateData, category: categoryName });
      const versionAuthorId = (req as any).user?.id;
      
      // Validate category name
      const trimmedCategoryName = (categoryName || "").trim();
      if (!trimmedCategoryName) {
        return res.status(400).json({ message: "Event Category обязательна", field: "category" });
      }
      
      const platforms = input.platforms || [];
      
      // Get current version data to compare
      const currentVersionData = await storage.getEventVersion(id, existing.currentVersion || 1);
      
      // Determine if versioned fields changed (requires new version)
      // Versioned fields: category, action, name, valueDescription, properties
      const categoryChanged = existing.category !== trimmedCategoryName;
      const actionChanged = existing.action !== input.action;
      const nameChanged = existing.name !== input.name;
      const valueDescriptionChanged = existing.valueDescription !== (input.valueDescription || "");
      const propertiesChanged = JSON.stringify(existing.properties || []) !== JSON.stringify(input.properties || []);
      
      const requiresNewVersion = categoryChanged || actionChanged || nameChanged || valueDescriptionChanged || propertiesChanged;
      
      let event;
      
      if (requiresNewVersion) {
        // Create new version
        const newVersion = (existing.currentVersion || 1) + 1;
        
        event = await storage.updateEventWithVersionAndStatuses(
          id,
          { ...updateData, currentVersion: newVersion },
          {
            version: newVersion,
            block: input.block || "",
            action: input.action,
            actionDescription: input.actionDescription || "",
            name: input.name,
            valueDescription: input.valueDescription || "",
            owner: input.owner,
            platforms: platforms,
            implementationStatus: "черновик",
            validationStatus: "ожидает_проверки",
            properties: input.properties || [],
            notes: input.notes,
            changeDescription: changeDescription || `Обновление до версии ${newVersion}`,
            authorId: versionAuthorId,
          },
          platforms,
          trimmedCategoryName
        );
      } else {
        // Update current version without creating new one
        event = await storage.updateEventWithoutNewVersion(
          id,
          {
            ...updateData,
            block: input.block || "",
            actionDescription: input.actionDescription || "",
            owner: input.owner,
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

  // Events - Delete (requires auth + canDeleteEvents)
  app.delete(api.events.delete.path, requireAuth, requirePermission("canDeleteEvents"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getEvent(id);
    if (!existing) {
      return res.status(404).json({ message: 'Event not found' });
    }
    // Atomic transaction: delete event + versions + statuses + history + comments
    await storage.deleteEventWithRelatedData(id);
    res.status(204).send();
  });

  // Events stats (requires auth)
  app.get(api.events.stats.path, requireAuth, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Events import preview - check for duplicates (requires auth + canCreateEvents)
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

      const allEvents = await storage.getEvents({});
      const newEvents: typeof events = [];
      const existingEvents: Array<{ parsed: typeof events[0]; existingId: number; existingVersion: number }> = [];
      const errors: string[] = [];

      for (const event of events) {
        if (!event.category || !event.action) {
          errors.push(`Событие без category или action пропущено`);
          continue;
        }

        const existing = allEvents.find(
          e => e.category === event.category && e.action === event.action
        );

        if (existing) {
          existingEvents.push({
            parsed: event,
            existingId: existing.id,
            existingVersion: existing.currentVersion || 1
          });
        } else {
          newEvents.push(event);
        }
      }

      res.json({ newEvents, existingEvents, errors });
    } catch (err) {
      res.status(500).json({ message: "Ошибка при анализе файла" });
    }
  });

  // Events import - create/update events (requires auth + canCreateEvents)
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
      const authorId = (req as any).user?.id;

      // Create new events
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
              owner: null,
              authorId,
              notes: null,
              implementationStatus: "черновик",
              validationStatus: "ожидает_проверки",
              currentVersion: 1,
            },
            {
              version: 1,
              category: event.category,
              action: event.action,
              name: event.name || null,
              block: event.block || "",
              actionDescription: event.actionDescription || "",
              valueDescription: event.valueDescription || "",
              platforms: event.platforms,
              properties: event.properties,
              owner: null,
              notes: null,
              implementationStatus: "черновик",
              validationStatus: "ожидает_проверки",
              changeDescription: "Импорт из CSV",
              authorId,
            },
            event.platforms
          );
          created++;
        } catch (err) {
          errors.push(`Ошибка создания ${event.category}/${event.action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Update existing events
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
              category: parsed.category,
              action: parsed.action,
              name: parsed.name || "",
              block: parsed.block || "",
              actionDescription: parsed.actionDescription || "",
              valueDescription: parsed.valueDescription || "",
              platforms: parsed.platforms,
              properties: parsed.properties,
              owner: existing.owner,
              notes: existing.notes,
              implementationStatus: "черновик",
              validationStatus: "ожидает_проверки",
              changeDescription: "Обновление из CSV импорта",
              authorId,
            },
            parsed.platforms
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

  // Comments - Read (requires auth)
  app.get("/api/events/:id/comments", requireAuth, async (req, res) => {
    const comments = await storage.getComments(Number(req.params.id));
    res.json(comments);
  });

  // Comments - Create (requires auth + canComment)
  app.post("/api/events/:id/comments", requireAuth, requirePermission("canComment"), async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const user = (req as any).user;
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

  // Property Templates API
  // Read - requires auth only (any authenticated user can view properties)
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

  // Create/Update/Delete - requires canManageProperties permission
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

  // Event Platform Statuses API (version-aware)
  // Read - requires auth
  app.get("/api/events/:eventId/platform-statuses", requireAuth, async (req, res) => {
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

  // Create platform status - requires canChangeStatuses permission
  app.post("/api/events/:eventId/platform-statuses", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      
      // Validate input with Zod
      const validated = createPlatformStatusSchema.parse(req.body);
      
      // Check if status for this platform already exists (check version 1 by default)
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
      
      // Add platform to event's platforms array if not already there
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

  // Update platform status - requires canChangeStatuses permission
  app.patch("/api/events/:eventId/platform-statuses/:platform", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform;
      const versionNumber = req.body.versionNumber ? Number(req.body.versionNumber) : undefined;
      const user = (req as any).user;
      
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

  // Delete platform status - requires canChangeStatuses permission
  app.delete("/api/events/:eventId/platform-statuses/:platform", requireAuth, requirePermission("canChangeStatuses"), async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const platform = req.params.platform;
      
      const existing = await storage.getEventPlatformStatus(eventId, platform, 1);
      if (!existing) {
        return res.status(404).json({ message: "Platform status not found" });
      }
      
      // Delete the platform status (this will cascade delete history via foreign key or we handle it)
      await storage.deletePlatformStatus(existing.id);
      
      // Update the platforms array to remove this platform
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

  // Status History API - requires auth
  app.get("/api/platform-statuses/:statusId/history", requireAuth, async (req, res) => {
    const statusId = Number(req.params.statusId);
    const history = await storage.getStatusHistory(statusId);
    res.json(history);
  });

  // Event Versions API - requires auth
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

  // Analytics API - proxy to Matomo/Piwik analytics (requires auth)
  const analyticsQuerySchema = z.object({
    label: z.string().min(1, "Label parameter is required"),
    platform: z.enum(["web", "ios", "android"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.get("/api/analytics/events", requireAuth, async (req, res) => {
    try {
      const validated = analyticsQuerySchema.safeParse(req.query);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid parameters" });
      }
      
      const { label, platform, startDate, endDate } = validated.data;
      
      // Default to last 30 days (excluding today for complete data)
      const defaultEndDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const defaultStartDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const actualStartDate = startDate || defaultStartDate;
      const actualEndDate = endDate || defaultEndDate;
      const dateRange = `${actualStartDate},${actualEndDate}`;
      
      // Get plugin config for analytics-chart
      const plugin = await storage.getPlugin("analytics-chart");
      const config = (plugin?.config as any) || {};
      
      // Get platform to siteId mapping from config or use defaults
      const platformSiteMapping: Record<string, number> = config.platformSiteMapping || {
        "web": 1,
        "ios": 2,
        "android": 3
      };
      
      const idSite = platform ? (platformSiteMapping[platform] || 1) : 1;
      
      // Get API URL from config or use default
      const apiUrl = config.apiUrl || "https://analytics.sutochno.ru/index.php";
      
      // Get token from config or environment
      const token = config.apiToken || process.env.ANALYTICS_API_TOKEN;
      if (!token) {
        return res.status(500).json({ message: "Analytics API token not configured" });
      }
      
      // Check cache first
      const { analyticsCache } = await import("./analyticsCache");
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
      if (data && typeof data === 'object' && data.result === 'error') {
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
  app.get("/api/analytics/cache-stats", requireAuth, requireAdmin, async (req, res) => {
    const { analyticsCache } = await import("./analyticsCache");
    res.json(analyticsCache.getStats());
  });
  
  // Clear analytics cache endpoint (admin only)
  app.post("/api/analytics/clear-cache", requireAuth, requireAdmin, async (req, res) => {
    const { analyticsCache } = await import("./analyticsCache");
    analyticsCache.clear();
    res.json({ message: "Cache cleared" });
  });

  // Users API - All user management requires admin role (canManageUsers)
  app.get(api.users.list.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get(api.users.get.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.post(api.users.create.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(input.email);
      if (existing) {
        return res.status(400).json({ message: "Email already exists", field: "email" });
      }
      
      // Hash password
      const { password, ...userData } = input;
      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = await storage.createUserWithPassword(userData, passwordHash);
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
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

  app.patch(api.users.update.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const input = api.users.update.input.parse(req.body);
      
      // Check email uniqueness if email is being changed
      if (input.email && input.email !== existing.email) {
        const emailExists = await storage.getUserByEmail(input.email);
        if (emailExists) {
          return res.status(400).json({ message: "Email already exists", field: "email" });
        }
      }
      
      // Handle password update
      const { password, ...userData } = input;
      let passwordHash: string | undefined;
      if (password) {
        passwordHash = await bcrypt.hash(password, 10);
      }
      
      const user = await storage.updateUser(id, userData, passwordHash);
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
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

  app.delete(api.users.delete.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getUser(id);
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.deleteUser(id);
    res.status(204).send();
  });

  // Initial seed data
  await seedDatabase();

  // ============ Auth Routes ============
  
  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password format" });
      }

      const { email, password } = result.data;
      const user = await storage.getUserByEmail(email);
      
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Аккаунт деактивирован" });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      req.session.userId = user.id;
      
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Ошибка при выходе" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Выход выполнен" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Не авторизован" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Пользователь не найден" });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // ============ Setup Routes ============

  // Check if system is configured
  app.get(api.setup.status.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json({
      isConfigured: users.length > 0,
      hasUsers: users.length > 0,
    });
  });

  // Complete initial setup - create first admin
  app.post(api.setup.complete.path, async (req, res) => {
    try {
      const users = await storage.getUsers();
      if (users.length > 0) {
        return res.status(409).json({ message: "Система уже настроена" });
      }

      const input = api.setup.complete.input.parse(req.body);
      const passwordHash = await bcrypt.hash(input.password, 10);

      const user = await storage.createUserWithPassword({
        name: input.name,
        email: input.email,
        role: "admin",
        isActive: true,
      }, passwordHash);

      req.session.userId = user.id;

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json({
        success: true,
        user: userWithoutPassword,
      });
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

  // ============ Plugin Routes ============

  // Get all plugins - requires auth
  app.get(api.plugins.list.path, requireAuth, async (req, res) => {
    const pluginsList = await storage.getPlugins();
    res.json(pluginsList);
  });

  // Get single plugin - requires auth
  app.get(api.plugins.get.path, requireAuth, async (req, res) => {
    const plugin = await storage.getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ message: "Plugin not found" });
    }
    res.json(plugin);
  });

  // Update plugin settings (admin only)
  app.patch(api.plugins.toggle.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.plugins.toggle.input.parse(req.body);
      const plugin = await storage.getPlugin(req.params.id);
      if (!plugin) {
        return res.status(404).json({ message: "Plugin not found" });
      }
      
      let updated = plugin;
      
      if (input.isEnabled !== undefined) {
        updated = await storage.updatePluginEnabled(req.params.id, input.isEnabled);
      }
      
      if (input.config !== undefined) {
        updated = await storage.updatePluginConfig(req.params.id, input.config);
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Seed default plugins
  await seedPlugins();

  return httpServer;
}

async function seedPlugins() {
  const existingPlugins = await storage.getPlugins();
  const existingIds = existingPlugins.map(p => p.id);

  if (!existingIds.includes("code-generator")) {
    await storage.upsertPlugin({
      id: "code-generator",
      name: "Генератор кода Matomo",
      description: "Генерирует примеры кода для отправки событий в Matomo для разных платформ (Web, iOS, Android)",
      version: "1.0.0",
      isEnabled: true,
      config: { showForPlatforms: ["web", "ios", "android"] },
    });
  }

  if (!existingIds.includes("analytics-chart")) {
    await storage.upsertPlugin({
      id: "analytics-chart",
      name: "График аналитики",
      description: "Отображает график событий за последние 30 дней с данными из системы аналитики Matomo",
      version: "1.0.0",
      isEnabled: true,
      config: { period: 30 },
    });
  }

  if (!existingIds.includes("platform-statuses")) {
    await storage.upsertPlugin({
      id: "platform-statuses",
      name: "Статусы платформ",
      description: "Управление статусами внедрения и валидации для каждой платформы с полной историей изменений",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }

  if (!existingIds.includes("comments")) {
    await storage.upsertPlugin({
      id: "comments",
      name: "Комментарии",
      description: "Система комментариев для обсуждения событий аналитики",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }

  if (!existingIds.includes("csv-import")) {
    await storage.upsertPlugin({
      id: "csv-import",
      name: "Импорт из CSV",
      description: "Массовый импорт событий из CSV файла",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }
}

async function seedDatabase() {
  const existing = await storage.getEvents();
  if (existing.events.length > 0) return;

  const sampleEvents = [
    {
      categoryName: "Авторизация",
      action: "finish_signup",
      actionDescription: "Пользователь успешно завершил процесс регистрации, заполнив все поля",
      name: "signup_completed",
      valueDescription: "Количество успешных регистраций",
      platforms: ["все"],
      implementationStatus: "внедрено" as const,
      validationStatus: "корректно" as const,
      owner: "Команда Авторизации",
      properties: [
        { name: "userId", type: "string", required: true, description: "Уникальный идентификатор пользователя" },
        { name: "method", type: "string", required: true, description: "email, google или apple" },
        { name: "platform", type: "string", required: true, description: "web, ios или android" }
      ]
    },
    {
      categoryName: "E-commerce",
      action: "click_checkout",
      actionDescription: "Нажатие на кнопку оформления заказа в корзине",
      name: "checkout_started",
      valueDescription: "Предварительная стоимость корзины",
      platforms: ["web", "ios", "android"],
      implementationStatus: "в_разработке" as const,
      validationStatus: "ожидает_проверки" as const,
      owner: "Команда Оформления",
      properties: [
        { name: "cartValue", type: "number", required: true, description: "Общая стоимость корзины" },
        { name: "itemCount", type: "number", required: true, description: "Количество товаров" }
      ]
    },
    {
      categoryName: "Стабильность",
      action: "crash",
      actionDescription: "Автоматическое событие при возникновении критического исключения",
      name: "app_crashed",
      valueDescription: "Код ошибки",
      platforms: ["ios", "android"],
      implementationStatus: "внедрено" as const,
      validationStatus: "ошибка" as const,
      owner: "Платформенная команда",
      notes: "В данный момент отсутствует свойство stack trace в продакшене",
      properties: [
        { name: "screen", type: "string", required: true, description: "Экран, где произошло падение" },
        { name: "version", type: "string", required: true, description: "Версия приложения" }
      ]
    }
  ];

  for (const event of sampleEvents) {
    const { categoryName, ...eventData } = event;
    const category = await storage.getOrCreateCategory(categoryName);
    await storage.createEvent({
      ...eventData,
      categoryId: category.id
    });
  }
}
