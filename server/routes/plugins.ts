import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { requireAdmin, requireAuth } from "./middleware";

export function registerPluginRoutes(app: Express) {
  // ============ Plugin Routes ============

  // Get all plugins - requires auth
  app.get(api.plugins.list.path, requireAuth, async (_req, res) => {
    const pluginsList = await storage.getPlugins();
    res.json(pluginsList);
  });

  // Get single plugin - requires auth
  app.get(api.plugins.get.path, requireAuth, async (req, res) => {
    const plugin = await storage.getPlugin(req.params.id as string);
    if (!plugin) {
      return res.status(404).json({ message: "Plugin not found" });
    }
    res.json(plugin);
  });

  // Update plugin settings (admin only)
  app.patch(api.plugins.toggle.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.plugins.toggle.input.parse(req.body);
      const pluginId = req.params.id as string;
      const plugin = await storage.getPlugin(pluginId);
      if (!plugin) {
        return res.status(404).json({ message: "Plugin not found" });
      }

      let updated = plugin;

      if (input.isEnabled !== undefined) {
        updated = await storage.updatePluginEnabled(pluginId, input.isEnabled);
      }

      if (input.config !== undefined) {
        updated = await storage.updatePluginConfig(pluginId, input.config);
      }

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });
}
