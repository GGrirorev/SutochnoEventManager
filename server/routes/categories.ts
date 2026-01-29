import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "./middleware";

export function registerCategoryRoutes(app: Express): void {
  app.get("/api/categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getCategoriesWithEventCount();
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

  app.put("/api/categories/:id", requireAuth, requirePermission("canEditEvents"), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      const existing = await storage.getCategoryById(id);
      if (!existing) {
        return res.status(404).json({ message: "Category not found" });
      }
      const { name, description } = req.body;
      const updates: { name?: string; description?: string } = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      const updated = await storage.updateCategory(id, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", requireAuth, requirePermission("canDeleteEvents"), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      const existing = await storage.getCategoryById(id);
      if (!existing) {
        return res.status(404).json({ message: "Category not found" });
      }
      const eventCount = await storage.getEventCountByCategory(id);
      if (eventCount > 0) {
        return res.status(400).json({ 
          message: `Невозможно удалить категорию. С ней связано ${eventCount} событий.` 
        });
      }
      await storage.deleteCategory(id);
      res.json({ message: "Category deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category" });
    }
  });
}
