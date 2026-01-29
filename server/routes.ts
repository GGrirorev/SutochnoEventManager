import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  csrfProtection,
  registerAuthRoutes,
  registerCategoryRoutes,
  registerEventRoutes,
  registerUserRoutes,
  registerAnalyticsRoutes,
  registerAlertRoutes,
  registerPluginRoutes,
  registerHttpLogsRoutes,
  seedPlugins,
  migrateAlertSettings,
} from "./routes/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.use(csrfProtection);
  
  registerCategoryRoutes(app);
  registerEventRoutes(app);
  registerAnalyticsRoutes(app);
  registerUserRoutes(app);
  registerAlertRoutes(app);
  registerHttpLogsRoutes(app);
  
  await seedDatabase();
  
  registerAuthRoutes(app);
  
  registerPluginRoutes(app);
  await seedPlugins();
  await migrateAlertSettings();

  return httpServer;
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
    await storage.createEvent({
      ...eventData,
      category: categoryName
    });
  }
}
