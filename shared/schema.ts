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
  "backend"
] as const;

// User roles
export const USER_ROLES = [
  "viewer",      // Только просмотр
  "developer",   // Просмотр и изменение статусов
  "analyst",     // Редактирование и создание событий, изменение статусов
  "admin"        // Полные права, включая управление пользователями
] as const;

export type UserRole = typeof USER_ROLES[number];

// Role descriptions in Russian
export const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "Только просмотр",
  developer: "Разработчик",
  analyst: "Аналитик",
  admin: "Администратор"
};

// Role permissions
export const ROLE_PERMISSIONS: Record<UserRole, {
  canViewEvents: boolean;
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canChangeStatuses: boolean;
  canManageUsers: boolean;
  canManageProperties: boolean;
}> = {
  viewer: {
    canViewEvents: true,
    canCreateEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canChangeStatuses: false,
    canManageUsers: false,
    canManageProperties: false
  },
  developer: {
    canViewEvents: true,
    canCreateEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canChangeStatuses: true,
    canManageUsers: false,
    canManageProperties: false
  },
  analyst: {
    canViewEvents: true,
    canCreateEvents: true,
    canEditEvents: true,
    canDeleteEvents: false,
    canChangeStatuses: true,
    canManageUsers: false,
    canManageProperties: true
  },
  admin: {
    canViewEvents: true,
    canCreateEvents: true,
    canEditEvents: true,
    canDeleteEvents: true,
    canChangeStatuses: true,
    canManageUsers: true,
    canManageProperties: true
  }
};

// Type for status history entry
export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
  changedBy?: string;
};

// Type for per-platform status with history
export type PlatformStatus = {
  implementationStatus: typeof IMPLEMENTATION_STATUS[number];
  validationStatus: typeof VALIDATION_STATUS[number];
  implementationHistory: StatusHistoryEntry[];
  validationHistory: StatusHistoryEntry[];
};

// Type for platform statuses object
export type PlatformStatuses = Record<string, PlatformStatus>;

// Event Categories table
export const eventCategories = pgTable("event_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventCategorySchema = createInsertSchema(eventCategories).omit({
  id: true,
  createdAt: true,
});

export type EventCategory = typeof eventCategories.$inferSelect;
export type InsertEventCategory = z.infer<typeof insertEventCategorySchema>;

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(), // Foreign key to event_categories
  block: text("block").default(""), // Block - where on the page the event occurs
  action: text("action").notNull(), // Event Action (Required)
  actionDescription: text("action_description").notNull().default(""), // Description for Event Action
  name: text("name"), // Event Name (Optional)
  valueDescription: text("value_description").default(""), // Event Value Description (Text)
  
  owner: text("owner"), 
  authorId: integer("author_id"),
  platforms: text("platforms").array().notNull().default(sql`ARRAY[]::text[]`),
  
  // Legacy global statuses (kept for display, actual statuses in event_platform_statuses table)
  implementationStatus: text("implementation_status", { enum: IMPLEMENTATION_STATUS }).notNull().default("черновик"),
  validationStatus: text("validation_status", { enum: VALIDATION_STATUS }).notNull().default("ожидает_проверки"),
  
  properties: jsonb("properties").$type<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[]>().default([]),
  
  notes: text("notes"), 
  
  // Versioning
  currentVersion: integer("current_version").notNull().default(1),
  
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

// Event Platform Statuses - stores per-platform status for each VERSION of an event
export const eventPlatformStatuses = pgTable("event_platform_statuses", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1), // Which version these statuses belong to
  platform: text("platform", { enum: PLATFORMS }).notNull(),
  jiraLink: text("jira_link"),
  implementationStatus: text("implementation_status", { enum: IMPLEMENTATION_STATUS }).notNull().default("черновик"),
  validationStatus: text("validation_status", { enum: VALIDATION_STATUS }).notNull().default("ожидает_проверки"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventPlatformStatusSchema = createInsertSchema(eventPlatformStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EventPlatformStatus = typeof eventPlatformStatuses.$inferSelect;
export type InsertEventPlatformStatus = z.infer<typeof insertEventPlatformStatusSchema>;

// Status History - tracks all status changes
export const statusHistory = pgTable("status_history", {
  id: serial("id").primaryKey(),
  eventPlatformStatusId: integer("event_platform_status_id").notNull(),
  statusType: text("status_type", { enum: ["implementation", "validation"] as const }).notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStatusHistorySchema = createInsertSchema(statusHistory).omit({
  id: true,
  createdAt: true,
});

export type StatusHistory = typeof statusHistory.$inferSelect;
export type InsertStatusHistory = z.infer<typeof insertStatusHistorySchema>;

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

// Event Versions - stores snapshots of events at each version
export const eventVersions = pgTable("event_versions", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  version: integer("version").notNull(), // v1, v2, v3...
  
  // Snapshot of event data at this version
  categoryId: integer("category_id").notNull(), // Foreign key to event_categories
  block: text("block").default(""),
  action: text("action").notNull(),
  actionDescription: text("action_description").notNull().default(""),
  name: text("name"),
  valueDescription: text("value_description").default(""),
  owner: text("owner"),
  platforms: text("platforms").array().notNull().default(sql`ARRAY[]::text[]`),
  implementationStatus: text("implementation_status", { enum: IMPLEMENTATION_STATUS }).notNull().default("черновик"),
  validationStatus: text("validation_status", { enum: VALIDATION_STATUS }).notNull().default("ожидает_проверки"),
  properties: jsonb("properties").$type<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[]>().default([]),
  notes: text("notes"),
  
  changeDescription: text("change_description"), // What changed in this version
  authorId: integer("author_id"), // ID of user who created this version
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventVersionSchema = createInsertSchema(eventVersions).omit({
  id: true,
  createdAt: true,
});

export type EventVersion = typeof eventVersions.$inferSelect;
export type InsertEventVersion = z.infer<typeof insertEventVersionSchema>;

// Base schema from events table, omitting auto-generated fields
const baseInsertEventSchema = createInsertSchema(events).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  categoryId: true, // categoryId is set server-side from category string
});

// Client sends "category" string, server converts to categoryId
export const insertEventSchema = baseInsertEventSchema.extend({
  category: z.string().min(1, "Event Category обязательна"),
});

export type Event = typeof events.$inferSelect & { category?: string };
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type CreateEventRequest = InsertEvent;
export type UpdateEventRequest = Partial<InsertEvent> & { changeDescription?: string };

export type StatusSummary = {
  status: string;
  count: number;
};

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: USER_ROLES }).notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Plugins table - tracks installed plugins and their enabled state
export const plugins = pgTable("plugins", {
  id: text("id").primaryKey(), // e.g., "code-generator"
  name: text("name").notNull(),
  description: text("description"),
  version: text("version").notNull().default("1.0.0"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  config: jsonb("config"), // Plugin-specific configuration
  installedAt: timestamp("installed_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPluginSchema = createInsertSchema(plugins).omit({
  installedAt: true,
  updatedAt: true,
});

export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = z.infer<typeof insertPluginSchema>;
