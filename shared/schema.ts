import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp, boolean, varchar, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for status tracking
export const IMPLEMENTATION_STATUS = [
  "черновик",
  "в_разработке", 
  "внедрено", 
  "архив"
] as const;

export const VALIDATION_STATUS = [
  "ожидает_проверки",
  "корректно",
  "ошибка",
  "предупреждение"
] as const;

export const PLATFORMS = [
  "web",
  "ios",
  "android",
  "backend",
  "все"
] as const;

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // Event Category (Required)
  action: text("action").notNull(), // Event Action (Required)
  actionDescription: text("action_description").notNull().default(""), // Description for Event Action
  name: text("name"), // Event Name (Optional)
  valueDescription: text("value_description").default(""), // Event Value Description (Text)
  
  owner: text("owner"), 
  platforms: text("platforms").array().notNull().default(sql`ARRAY['все']::text[]`), 
  
  implementationStatus: text("implementation_status", { enum: IMPLEMENTATION_STATUS }).notNull().default("черновик"),
  validationStatus: text("validation_status", { enum: VALIDATION_STATUS }).notNull().default("ожидает_проверки"),
  
  properties: jsonb("properties").$type<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[]>().default([]),
  
  notes: text("notes"), 
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull().default("Аноним"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({ 
  id: true, 
  createdAt: true 
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

// Property categories
export const PROPERTY_CATEGORIES = [
  "посещения",
  "действия",
  "пользователь",
  "устройство",
  "другое"
] as const;

export const PROPERTY_TYPES = [
  "текст",
  "целое_число",
  "дробное_число",
  "дата_и_время",
  "булево",
  "массив",
  "объект"
] as const;

// Global property templates library
export const propertyTemplates = pgTable("property_templates", {
  id: serial("id").primaryKey(),
  dimension: integer("dimension").notNull().unique(), // Unique dimension number
  name: text("name").notNull(), // Property name (e.g., "User Type")
  description: text("description"), // Description of the property
  exampleData: text("example_data"), // Example values (e.g., "Guest, Super_Guest, Host, Admin")
  storageFormat: text("storage_format", { enum: PROPERTY_TYPES }).notNull().default("текст"),
  category: text("category", { enum: PROPERTY_CATEGORIES }).notNull().default("другое"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPropertyTemplateSchema = createInsertSchema(propertyTemplates).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

export type PropertyTemplate = typeof propertyTemplates.$inferSelect;
export type InsertPropertyTemplate = z.infer<typeof insertPropertyTemplateSchema>;

export const insertEventSchema = createInsertSchema(events).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type CreateEventRequest = InsertEvent;
export type UpdateEventRequest = Partial<InsertEvent>;

export type StatusSummary = {
  status: string;
  count: number;
};
