import type { Express } from "express";
import type { Server } from "http";
import { csrfProtection } from "./middleware";
import { registerAlertRoutes } from "./alerts";
import { registerAnalyticsRoutes } from "./analytics";
import { registerAuthRoutes } from "./auth";
import { registerCategoryRoutes } from "./categories";
import { registerCommentRoutes } from "./comments";
import { registerEventRoutes } from "./events";
import { registerEventVersionRoutes } from "./event-versions";
import { registerPlatformStatusRoutes } from "./platform-statuses";
import { registerPluginRoutes } from "./plugins";
import { registerPropertyTemplateRoutes } from "./property-templates";
import { registerSetupRoutes } from "./setup";
import { registerUserRoutes } from "./users";
import { seedDatabase, seedPlugins } from "./seed";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Apply CSRF protection globally for all state-changing requests
  app.use(csrfProtection);

  registerCategoryRoutes(app);
  registerEventRoutes(app);
  registerCommentRoutes(app);
  registerPropertyTemplateRoutes(app);
  registerPlatformStatusRoutes(app);
  registerEventVersionRoutes(app);
  registerAnalyticsRoutes(app);
  registerUserRoutes(app);
  registerAlertRoutes(app);
  registerAuthRoutes(app);
  registerSetupRoutes(app);
  registerPluginRoutes(app);

  // Initial seed data
  await seedDatabase();

  // Seed default plugins
  await seedPlugins();

  return httpServer;
}
