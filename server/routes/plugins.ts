import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./middleware";

export function registerPluginRoutes(app: Express): void {
  app.get(api.plugins.list.path, requireAuth, async (req, res) => {
    const pluginsList = await storage.getPlugins();
    res.json(pluginsList);
  });

  app.get(api.plugins.get.path, requireAuth, async (req, res) => {
    const plugin = await storage.getPlugin(req.params.id as string);
    if (!plugin) {
      return res.status(404).json({ message: "Plugin not found" });
    }
    res.json(plugin);
  });

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

export async function seedPlugins() {
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

  if (!existingIds.includes("alerts")) {
    await storage.upsertPlugin({
      id: "alerts",
      name: "Мониторинг событий",
      description: "Мониторинг падения событий аналитики с уведомлениями о значительном снижении показателей",
      version: "1.0.0",
      isEnabled: true,
      config: {
        matomoUrl: "https://analytics.sutochno.ru/index.php",
        matomoToken: null,
        matomoSiteId: "web:1,ios:2,android:3",
        dropThreshold: 30,
        maxConcurrency: 5,
      },
    });
  }
}

export async function migrateAlertSettings() {
  try {
    const alertsPlugin = await storage.getPlugin("alerts");
    if (!alertsPlugin) return;
    
    const config = alertsPlugin.config as Record<string, unknown> | null;
    
    if (config && config.matomoUrl) return;
    
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    
    const legacySettings = await db.execute(sql`
      SELECT matomo_url, matomo_token, matomo_site_id, drop_threshold, max_concurrency, is_enabled
      FROM alert_settings
      LIMIT 1
    `).catch(() => null);
    
    if (legacySettings && legacySettings.rows && legacySettings.rows.length > 0) {
      const settings = legacySettings.rows[0] as {
        matomo_url: string;
        matomo_token: string;
        matomo_site_id: string;
        drop_threshold: number;
        max_concurrency: number;
        is_enabled: boolean;
      };
      
      await storage.updateAlertSettings({
        matomoUrl: settings.matomo_url || "https://analytics.sutochno.ru/index.php",
        matomoToken: settings.matomo_token || null,
        matomoSiteId: settings.matomo_site_id || "web:1,ios:2,android:3",
        dropThreshold: settings.drop_threshold || 30,
        maxConcurrency: settings.max_concurrency || 5,
        isEnabled: settings.is_enabled ?? true,
      });
      
      console.log("Migrated alert settings from legacy table to plugins.config");
    }
  } catch (error) {
    console.log("Alert settings migration skipped (legacy table may not exist)");
  }
}
