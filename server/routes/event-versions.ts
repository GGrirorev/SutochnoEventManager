import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./middleware";

export function registerEventVersionRoutes(app: Express) {
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
}
