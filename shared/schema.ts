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
  value: integer("value").default(0), // Event Value (Numeric data)
  valueDescription: text("value_description").default(""), // Event Value Description (Text)
  
  owner: text("owner"), 
  platform: text("platform", { enum: PLATFORMS }).notNull().default("все"),
  
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
