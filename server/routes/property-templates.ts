import type { Express } from "express";
import { z } from "zod";
import { insertPropertyTemplateSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "./middleware";

const createPropertyTemplateSchema = insertPropertyTemplateSchema;
const updatePropertyTemplateSchema = insertPropertyTemplateSchema.partial();

export function registerPropertyTemplateRoutes(app: Express) {
  // Property Templates API
  // Read - requires auth only (any authenticated user can view properties)
  app.get("/api/property-templates", requireAuth, async (req, res) => {
    const category = req.query.category as string | undefined;
    const templates = await storage.getPropertyTemplates(category);
    res.json(templates);
  });

  app.get("/api/property-templates/next-dimension", requireAuth, async (_req, res) => {
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
          field: error.errors[0].path.join("."),
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
          field: error.errors[0].path.join("."),
        });
      }
      res.status(400).json({ message: error.message || "Failed to update template" });
    }
  });

  app.delete("/api/property-templates/:id", requireAuth, requirePermission("canManageProperties"), async (req, res) => {
    await storage.deletePropertyTemplate(Number(req.params.id));
    res.status(204).send();
  });
}
