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
      name: "signup_completed",
      description: "User successfully completes the signup flow",
      category: "Auth",
      platform: "all",
      implementationStatus: "implemented",
      validationStatus: "valid",
      owner: "Auth Team",
      properties: [
        { name: "userId", type: "string", required: true, description: "Unique user identifier" },
        { name: "method", type: "string", required: true, description: "email, google, or apple" },
        { name: "platform", type: "string", required: true, description: "web, ios, or android" }
      ]
    },
    {
      name: "checkout_started",
      description: "User clicks the checkout button",
      category: "E-commerce",
      platform: "web",
      implementationStatus: "in_development",
      validationStatus: "pending",
      owner: "Checkout Squad",
      properties: [
        { name: "cartValue", type: "number", required: true, description: "Total value of items in cart" },
        { name: "itemCount", type: "number", required: true, description: "Number of items" }
      ]
    },
    {
      name: "app_crashed",
      description: "Critical error causing app crash",
      category: "Stability",
      platform: "ios",
      implementationStatus: "implemented",
      validationStatus: "error",
      owner: "Platform Team",
      notes: "Currently missing stack trace property in prod",
      properties: [
        { name: "screen", type: "string", required: true, description: "Screen where crash happened" },
        { name: "version", type: "string", required: true, description: "App version" }
      ]
    },
    {
      name: "search_performed",
      description: "User executes a search query",
      category: "Discovery",
      platform: "all",
      implementationStatus: "specified",
      validationStatus: "pending",
      owner: "Search Team",
      properties: [
        { name: "query", type: "string", required: true, description: "Search term" },
        { name: "filters", type: "json", required: false, description: "Applied filters" }
      ]
    },
    {
      name: "video_played",
      description: "User starts playing a video",
      category: "Content",
      platform: "android",
      implementationStatus: "deprecated",
      validationStatus: "warning",
      owner: "Media Team",
      notes: "Replacing with media_interaction event",
      properties: [
        { name: "videoId", type: "string", required: true, description: "ID of the video" },
        { name: "duration", type: "number", required: true, description: "Video duration in seconds" }
      ]
    }
  ];

  for (const event of sampleEvents) {
    // @ts-ignore - types are compatible but strict null checks might complain about literals
    await storage.createEvent(event);
  }
}
