import type { Express } from "express";
import { z } from "zod";
import { IMPLEMENTATION_STATUS, PLATFORMS, VALIDATION_STATUS } from "@shared/schema";
import { storage } from "../storage";
import { AuthenticatedRequest, requireAuth, requirePermission } from "./middleware";

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

export function registerPlatformStatusRoutes(app: Express) {
  // Event Platform Statuses API (version-aware)
  // Read - requires auth
  app.get("/api/events/:eventId/platform-statuses", requireAuth, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const versionNumber = req.query.version ? Number(req.query.version) : undefined;

    const statuses = await storage.getEventPlatformStatuses(eventId, versionNumber);

    // Also fetch history for each status
    const statusesWithHistory = await Promise.all(
      statuses.map(async (status) => {
        const history = await storage.getStatusHistory(status.id);
        return { ...status, history };
      })
    );

    res.json(statusesWithHistory);
  });

  // Create platform status - requires canChangeStatuses permission
  app.post(
    "/api/events/:eventId/platform-statuses",
    requireAuth,
    requirePermission("canChangeStatuses"),
    async (req, res) => {
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
          validationStatus: validated.validationStatus,
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
    }
  );

  // Update platform status - requires canChangeStatuses permission
  app.patch(
    "/api/events/:eventId/platform-statuses/:platform",
    requireAuth,
    requirePermission("canChangeStatuses"),
    async (req, res) => {
      try {
        const eventId = Number(req.params.eventId);
        const platform = req.params.platform;
        const versionNumber = req.body.versionNumber ? Number(req.body.versionNumber) : undefined;
        const user = (req as AuthenticatedRequest).user;

        // Validate input with Zod
        const validated = updatePlatformStatusSchema.parse(req.body);

        // Get current event to determine default version
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        const targetVersion = versionNumber || event.currentVersion;
        const existing = await storage.getEventPlatformStatus(eventId, platform as string, targetVersion);
        if (!existing) {
          return res.status(404).json({ message: "Platform status not found for this version" });
        }

        // Track status changes in history
        if (
          validated.implementationStatus &&
          validated.implementationStatus !== existing.implementationStatus
        ) {
          await storage.createStatusHistory({
            eventPlatformStatusId: existing.id,
            statusType: "implementation",
            oldStatus: existing.implementationStatus,
            newStatus: validated.implementationStatus,
            changedByUserId: user.id,
            comment: validated.statusComment || null,
            jiraLink: validated.statusJiraLink || null,
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
            jiraLink: validated.statusJiraLink || null,
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
    }
  );

  // Delete platform status - requires canChangeStatuses permission
  app.delete(
    "/api/events/:eventId/platform-statuses/:platform",
    requireAuth,
    requirePermission("canChangeStatuses"),
    async (req, res) => {
      try {
        const eventId = Number(req.params.eventId);
        const platform = req.params.platform as string;

        const existing = await storage.getEventPlatformStatus(eventId, platform, 1);
        if (!existing) {
          return res.status(404).json({ message: "Platform status not found" });
        }

        // Delete the platform status (this will cascade delete history via foreign key or we handle it)
        await storage.deletePlatformStatus(existing.id);

        // Update the platforms array to remove this platform
        const event = await storage.getEvent(eventId);
        if (event) {
          const platforms = (event.platforms || []).filter((p) => p !== platform);
          await storage.updateEvent(eventId, { platforms });
        }

        res.status(204).send();
      } catch (error: any) {
        res.status(400).json({ message: error.message || "Failed to delete platform status" });
      }
    }
  );

  // Status History API - requires auth
  app.get("/api/platform-statuses/:statusId/history", requireAuth, async (req, res) => {
    const statusId = Number(req.params.statusId);
    const history = await storage.getStatusHistory(statusId);
    res.json(history);
  });
}
