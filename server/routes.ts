import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { PLATFORMS, IMPLEMENTATION_STATUS } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.events.list.path, async (req, res) => {
    try {
      // Manual query param extraction since Zod is used for validation but express query params are strings
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        platform: req.query.platform as string | undefined,
        status: req.query.status as string | undefined,
      };
      
      const events = await storage.getEvents(filters);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get(api.events.get.path, async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  });

  app.post(api.events.create.path, async (req, res) => {
    try {
      const input = api.events.create.input.parse(req.body);
      const event = await storage.createEvent(input);
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.events.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const input = api.events.update.input.parse(req.body);
      const event = await storage.updateEvent(id, input);
      res.json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.events.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getEvent(id);
    if (!existing) {
      return res.status(404).json({ message: 'Event not found' });
    }
    await storage.deleteEvent(id);
    res.status(204).send();
  });

  app.get(api.events.stats.path, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Initial seed data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getEvents();
  if (existing.length > 0) return;

  const sampleEvents = [
    {
      category: "Авторизация",
      action: "finish_signup",
      actionDescription: "Пользователь успешно завершил процесс регистрации, заполнив все поля",
      name: "signup_completed",
      value: 1,
      valueDescription: "Количество успешных регистраций",
      platform: "все",
      implementationStatus: "внедрено",
      validationStatus: "корректно",
      owner: "Команда Авторизации",
      properties: [
        { name: "userId", type: "string", required: true, description: "Уникальный идентификатор пользователя" },
        { name: "method", type: "string", required: true, description: "email, google или apple" },
        { name: "platform", type: "string", required: true, description: "web, ios или android" }
      ]
    },
    {
      category: "E-commerce",
      action: "click_checkout",
      actionDescription: "Нажатие на кнопку оформления заказа в корзине",
      name: "checkout_started",
      value: 100,
      valueDescription: "Предварительная стоимость корзины",
      platform: "web",
      implementationStatus: "в_разработке",
      validationStatus: "ожидает_проверки",
      owner: "Команда Оформления",
      properties: [
        { name: "cartValue", type: "number", required: true, description: "Общая стоимость корзины" },
        { name: "itemCount", type: "number", required: true, description: "Количество товаров" }
      ]
    },
    {
      category: "Стабильность",
      action: "crash",
      actionDescription: "Автоматическое событие при возникновении критического исключения",
      name: "app_crashed",
      value: -1,
      valueDescription: "Код ошибки",
      platform: "ios",
      implementationStatus: "внедрено",
      validationStatus: "ошибка",
      owner: "Платформенная команда",
      notes: "В данный момент отсутствует свойство stack trace в продакшене",
      properties: [
        { name: "screen", type: "string", required: true, description: "Экран, где произошло падение" },
        { name: "version", type: "string", required: true, description: "Версия приложения" }
      ]
    }
  ];

  for (const event of sampleEvents) {
    // @ts-ignore
    await storage.createEvent(event);
  }
}
