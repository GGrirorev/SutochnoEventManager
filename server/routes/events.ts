import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { AuthenticatedRequest, requireAuth, requirePermission } from "./middleware";

export function registerEventRoutes(app: Express) {
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
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  });

  // Events - Create (requires auth + canCreateEvents)
  app.post(api.events.create.path, requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { category: categoryName, ...inputData } = req.body;
      const input = api.events.create.input.parse({ ...inputData, category: categoryName });
      const platforms = input.platforms || [];
      const authorId = (req as AuthenticatedRequest).user?.id;

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
          field: err.errors[0].path.join("."),
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
        return res.status(404).json({ message: "Event not found" });
      }

      const { changeDescription, category: categoryName, ...updateData } = req.body;
      const input = api.events.update.input.parse({ ...updateData, category: categoryName });
      const versionAuthorId = (req as AuthenticatedRequest).user?.id;

      // Validate category name
      const trimmedCategoryName = (categoryName || "").trim();
      if (!trimmedCategoryName) {
        return res.status(400).json({ message: "Event Category обязательна", field: "category" });
      }

      const platforms = input.platforms || [];

      // Determine if versioned fields changed (requires new version)
      // Versioned fields: category, action, name, valueDescription, properties
      const categoryChanged = existing.category !== trimmedCategoryName;
      const actionChanged = existing.action !== input.action;
      const nameChanged = existing.name !== input.name;
      const valueDescriptionChanged = existing.valueDescription !== (input.valueDescription || "");
      const propertiesChanged =
        JSON.stringify(existing.properties || []) !== JSON.stringify(input.properties || []);

      const requiresNewVersion =
        categoryChanged || actionChanged || nameChanged || valueDescriptionChanged || propertiesChanged;

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
            action: input.action || existing.action,
            actionDescription: input.actionDescription || "",
            name: input.name,
            valueDescription: input.valueDescription || "",
            owner: input.owner,
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
          field: err.errors[0].path.join("."),
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
      return res.status(404).json({ message: "Event not found" });
    }
    // Atomic transaction: delete event + versions + statuses + history + comments
    await storage.deleteEventWithRelatedData(id);
    res.status(204).send();
  });

  // Events stats (requires auth)
  app.get(api.events.stats.path, requireAuth, async (_req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Events import preview - check for duplicates (requires auth + canCreateEvents)
  app.post("/api/events/import/preview", requireAuth, requirePermission("canCreateEvents"), async (req, res) => {
    try {
      const { events } = req.body as {
        events: Array<{
          platforms: string[];
          block: string;
          actionDescription: string;
          category: string;
          action: string;
          name: string;
          valueDescription: string;
          properties: { name: string; type: string; required: boolean; description: string }[];
        }>;
      };

      const { events: allEvents } = await storage.getEvents({});
      const newEvents: typeof events = [];
      const existingEvents: Array<{
        parsed: (typeof events)[0];
        existingId: number;
        existingVersion: number;
      }> = [];
      const errors: string[] = [];

      for (const event of events) {
        if (!event.category || !event.action) {
          errors.push("Событие без category или action пропущено");
          continue;
        }

        const existing = allEvents.find((e) => e.category === event.category && e.action === event.action);

        if (existing) {
          existingEvents.push({
            parsed: event,
            existingId: existing.id,
            existingVersion: existing.currentVersion || 1,
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
      const authorId = (req as AuthenticatedRequest).user?.id;

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
              owner: null,
              notes: null,
              changeDescription: "Импорт из CSV",
              authorId,
            },
            event.platforms,
            event.category
          );
          created++;
        } catch (err) {
          errors.push(
            `Ошибка создания ${event.category}/${event.action}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
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
              action: parsed.action,
              name: parsed.name || "",
              block: parsed.block || "",
              actionDescription: parsed.actionDescription || "",
              valueDescription: parsed.valueDescription || "",
              platforms: parsed.platforms,
              properties: parsed.properties,
              owner: existing.owner,
              notes: existing.notes,
              changeDescription: "Обновление из CSV импорта",
              authorId,
            },
            parsed.platforms,
            parsed.category
          );
          updated++;
        } catch (err) {
          errors.push(
            `Ошибка обновления ${parsed.category}/${parsed.action}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }

      res.json({ created, updated, skipped, errors });
    } catch (err) {
      res.status(500).json({ message: "Ошибка импорта" });
    }
  });
}
