import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "./middleware";

export function registerCategoryRoutes(app: Express) {
  // Categories API
  app.get("/api/categories", requireAuth, async (_req, res) => {
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
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Category name is required" });
      }
      const category = await storage.getOrCreateCategory(name.trim());
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Failed to create category" });
    }
  });
}
