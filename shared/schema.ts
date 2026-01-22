import { pgTable, text, serial, timestamp, boolean, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for status tracking
export const IMPLEMENTATION_STATUS = [
  "specified",
  "in_development", 
  "implemented", 
  "deprecated"
] as const;

export const VALIDATION_STATUS = [
  "pending",
  "valid",
  "error",
  "warning"
] as const;

export const PLATFORMS = [
  "web",
  "ios",
  "android",
  "backend",
  "all"
] as const;

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "button_clicked", "page_viewed"
  description: text("description").notNull(),
  category: text("category").notNull(), // e.g., "Auth", "Navigation", "Checkout"
  
  // Tracking plan details
  owner: text("owner"), // PM or Dev responsible
  platform: text("platform", { enum: PLATFORMS }).notNull().default("all"),
  
  // Status flags
  implementationStatus: text("implementation_status", { enum: IMPLEMENTATION_STATUS }).notNull().default("specified"),
  validationStatus: text("validation_status", { enum: VALIDATION_STATUS }).notNull().default("pending"),
  
  // Technical details
  properties: jsonb("properties").$type<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[]>().default([]),
  
  notes: text("notes"), // For specific implementation details or error logs
  
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

// API Types
export type CreateEventRequest = InsertEvent;
export type UpdateEventRequest = Partial<InsertEvent>;

// Analytics/Summary types
export type StatusSummary = {
  status: string;
  count: number;
};
