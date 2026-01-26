import { db } from "./db";
import {
  events,
  comments,
  propertyTemplates,
  eventPlatformStatuses,
  statusHistory,
  eventVersions,
  users,
  plugins,
  type Event,
  type InsertEvent,
  type UpdateEventRequest,
  type StatusSummary,
  type Comment,
  type InsertComment,
  type PropertyTemplate,
  type InsertPropertyTemplate,
  type EventPlatformStatus,
  type InsertEventPlatformStatus,
  type StatusHistory,
  type InsertStatusHistory,
  type EventVersion,
  type InsertEventVersion,
  type User,
  type InsertUser,
  type Plugin,
  type InsertPlugin,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS
} from "@shared/schema";
import { eq, ilike, and, desc, sql } from "drizzle-orm";

export type EventWithAuthor = Event & { authorName?: string | null };
export type EventVersionWithAuthor = EventVersion & { authorName?: string | null };

export interface IStorage {
  getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    status?: string;
  }): Promise<EventWithAuthor[]>;
  getEvent(id: number): Promise<EventWithAuthor | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: UpdateEventRequest): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  getStats(): Promise<{
    total: number;
    byImplementationStatus: Record<string, number>;
    byValidationStatus: Record<string, number>;
  }>;
  // Comment operations
  getComments(eventId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  
  // Property template operations
  getPropertyTemplates(category?: string): Promise<PropertyTemplate[]>;
  getPropertyTemplate(id: number): Promise<PropertyTemplate | undefined>;
  createPropertyTemplate(template: InsertPropertyTemplate): Promise<PropertyTemplate>;
  updatePropertyTemplate(id: number, updates: Partial<InsertPropertyTemplate>): Promise<PropertyTemplate>;
  deletePropertyTemplate(id: number): Promise<void>;
  getNextDimension(): Promise<number>;
  
  // Event platform status operations (version-aware)
  getEventPlatformStatuses(eventId: number, versionNumber?: number): Promise<EventPlatformStatus[]>;
  getEventPlatformStatus(eventId: number, platform: string, versionNumber: number): Promise<EventPlatformStatus | undefined>;
  createEventPlatformStatus(status: InsertEventPlatformStatus): Promise<EventPlatformStatus>;
  updateEventPlatformStatus(id: number, updates: Partial<InsertEventPlatformStatus>): Promise<EventPlatformStatus>;
  deletePlatformStatus(id: number): Promise<void>;
  deleteEventPlatformStatuses(eventId: number): Promise<void>;
  createVersionPlatformStatuses(eventId: number, versionNumber: number, platforms: string[]): Promise<EventPlatformStatus[]>;
  
  // Status history operations
  getStatusHistory(eventPlatformStatusId: number): Promise<StatusHistory[]>;
  createStatusHistory(history: InsertStatusHistory): Promise<StatusHistory>;
  
  // Event version operations
  getEventVersions(eventId: number): Promise<EventVersionWithAuthor[]>;
  getEventVersion(eventId: number, version: number): Promise<EventVersionWithAuthor | undefined>;
  createEventVersion(version: InsertEventVersion): Promise<EventVersion>;
  
  // User operations
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithPassword(user: InsertUser, passwordHash: string): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>, passwordHash?: string): Promise<User>;
  deleteUser(id: number): Promise<void>;
  
  // Plugin operations
  getPlugins(): Promise<Plugin[]>;
  getPlugin(id: string): Promise<Plugin | undefined>;
  upsertPlugin(plugin: InsertPlugin): Promise<Plugin>;
  updatePluginEnabled(id: string, isEnabled: boolean): Promise<Plugin>;
  updatePluginConfig(id: string, config: any): Promise<Plugin>;
  deletePlugin(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    status?: string;
  }): Promise<EventWithAuthor[]> {
    const conditions = [];

    if (filters?.search) {
      conditions.push(ilike(events.name, `%${filters.search}%`));
    }
    if (filters?.category) {
      conditions.push(eq(events.category, filters.category));
    }
    if (filters?.platform) {
      conditions.push(sql`${events.platforms} @> ARRAY[${filters.platform}]::text[]`);
    }
    if (filters?.status) {
      conditions.push(eq(events.implementationStatus, filters.status));
    }

    const result = await db.select({
      id: events.id,
      category: events.category,
      block: events.block,
      action: events.action,
      actionDescription: events.actionDescription,
      name: events.name,
      valueDescription: events.valueDescription,
      owner: events.owner,
      authorId: events.authorId,
      authorName: users.name,
      platforms: events.platforms,
      implementationStatus: events.implementationStatus,
      validationStatus: events.validationStatus,
      properties: events.properties,
      notes: events.notes,
      currentVersion: events.currentVersion,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(events.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(events.createdAt));
    
    return result;
  }

  async getEvent(id: number): Promise<EventWithAuthor | undefined> {
    const [event] = await db.select({
      id: events.id,
      category: events.category,
      block: events.block,
      action: events.action,
      actionDescription: events.actionDescription,
      name: events.name,
      valueDescription: events.valueDescription,
      owner: events.owner,
      authorId: events.authorId,
      authorName: users.name,
      platforms: events.platforms,
      implementationStatus: events.implementationStatus,
      validationStatus: events.validationStatus,
      properties: events.properties,
      notes: events.notes,
      currentVersion: events.currentVersion,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(events.authorId, users.id))
      .where(eq(events.id, id));
    return event;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(insertEvent).returning();
    return event;
  }

  async updateEvent(id: number, updates: UpdateEventRequest): Promise<Event> {
    const [event] = await db.update(events)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return event;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async getStats(): Promise<{
    total: number;
    byImplementationStatus: Record<string, number>;
    byValidationStatus: Record<string, number>;
  }> {
    const allEvents = await db.select().from(events);
    
    const byImplementationStatus: Record<string, number> = {};
    IMPLEMENTATION_STATUS.forEach(s => byImplementationStatus[s] = 0);
    
    const byValidationStatus: Record<string, number> = {};
    VALIDATION_STATUS.forEach(s => byValidationStatus[s] = 0);

    allEvents.forEach(event => {
      byImplementationStatus[event.implementationStatus] = (byImplementationStatus[event.implementationStatus] || 0) + 1;
      byValidationStatus[event.validationStatus] = (byValidationStatus[event.validationStatus] || 0) + 1;
    });

    return {
      total: allEvents.length,
      byImplementationStatus,
      byValidationStatus
    };
  }

  // Comment operations
  async getComments(eventId: number): Promise<Comment[]> {
    return await db.select().from(comments).where(eq(comments.eventId, eventId)).orderBy(desc(comments.createdAt));
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  // Property template operations
  async getPropertyTemplates(category?: string): Promise<PropertyTemplate[]> {
    if (category) {
      return await db.select().from(propertyTemplates)
        .where(eq(propertyTemplates.category, category))
        .orderBy(propertyTemplates.dimension);
    }
    return await db.select().from(propertyTemplates).orderBy(propertyTemplates.dimension);
  }

  async getPropertyTemplate(id: number): Promise<PropertyTemplate | undefined> {
    const [template] = await db.select().from(propertyTemplates).where(eq(propertyTemplates.id, id));
    return template;
  }

  async createPropertyTemplate(template: InsertPropertyTemplate): Promise<PropertyTemplate> {
    const [newTemplate] = await db.insert(propertyTemplates).values(template).returning();
    return newTemplate;
  }

  async updatePropertyTemplate(id: number, updates: Partial<InsertPropertyTemplate>): Promise<PropertyTemplate> {
    const [template] = await db.update(propertyTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(propertyTemplates.id, id))
      .returning();
    return template;
  }

  async deletePropertyTemplate(id: number): Promise<void> {
    await db.delete(propertyTemplates).where(eq(propertyTemplates.id, id));
  }

  async getNextDimension(): Promise<number> {
    const result = await db.select().from(propertyTemplates).orderBy(desc(propertyTemplates.dimension)).limit(1);
    return result.length > 0 ? result[0].dimension + 1 : 1;
  }

  // Event platform status operations (version-aware)
  async getEventPlatformStatuses(eventId: number, versionNumber?: number): Promise<EventPlatformStatus[]> {
    if (versionNumber !== undefined) {
      return await db.select()
        .from(eventPlatformStatuses)
        .where(and(
          eq(eventPlatformStatuses.eventId, eventId),
          eq(eventPlatformStatuses.versionNumber, versionNumber)
        ))
        .orderBy(eventPlatformStatuses.platform);
    }
    // If no version specified, return all
    return await db.select()
      .from(eventPlatformStatuses)
      .where(eq(eventPlatformStatuses.eventId, eventId))
      .orderBy(eventPlatformStatuses.platform);
  }

  async getEventPlatformStatus(eventId: number, platform: string, versionNumber: number): Promise<EventPlatformStatus | undefined> {
    const [status] = await db.select()
      .from(eventPlatformStatuses)
      .where(and(
        eq(eventPlatformStatuses.eventId, eventId),
        eq(eventPlatformStatuses.platform, platform),
        eq(eventPlatformStatuses.versionNumber, versionNumber)
      ));
    return status;
  }

  async createEventPlatformStatus(status: InsertEventPlatformStatus): Promise<EventPlatformStatus> {
    const [newStatus] = await db.insert(eventPlatformStatuses).values(status).returning();
    return newStatus;
  }

  async updateEventPlatformStatus(id: number, updates: Partial<InsertEventPlatformStatus>): Promise<EventPlatformStatus> {
    const [status] = await db.update(eventPlatformStatuses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(eventPlatformStatuses.id, id))
      .returning();
    return status;
  }

  async deletePlatformStatus(id: number): Promise<void> {
    // First delete related status history
    await db.delete(statusHistory).where(eq(statusHistory.eventPlatformStatusId, id));
    // Then delete platform status
    await db.delete(eventPlatformStatuses).where(eq(eventPlatformStatuses.id, id));
  }

  async deleteEventPlatformStatuses(eventId: number): Promise<void> {
    // First delete related status history
    const platformStatuses = await this.getEventPlatformStatuses(eventId);
    for (const ps of platformStatuses) {
      await db.delete(statusHistory).where(eq(statusHistory.eventPlatformStatusId, ps.id));
    }
    // Then delete platform statuses
    await db.delete(eventPlatformStatuses).where(eq(eventPlatformStatuses.eventId, eventId));
  }

  async createVersionPlatformStatuses(eventId: number, versionNumber: number, platforms: string[]): Promise<EventPlatformStatus[]> {
    const createdStatuses: EventPlatformStatus[] = [];
    
    for (const platform of platforms) {
      // Create status record with default values for new version
      // No initial history entries - history starts when user actually changes status
      const [status] = await db.insert(eventPlatformStatuses).values({
        eventId,
        versionNumber,
        platform: platform as any,
        implementationStatus: "черновик",
        validationStatus: "ожидает_проверки"
      }).returning();
      
      createdStatuses.push(status);
    }
    
    return createdStatuses;
  }

  // Status history operations
  async getStatusHistory(eventPlatformStatusId: number): Promise<StatusHistory[]> {
    return await db.select()
      .from(statusHistory)
      .where(eq(statusHistory.eventPlatformStatusId, eventPlatformStatusId))
      .orderBy(desc(statusHistory.createdAt));
  }

  async createStatusHistory(history: InsertStatusHistory): Promise<StatusHistory> {
    const [newHistory] = await db.insert(statusHistory).values(history).returning();
    return newHistory;
  }

  // Event version operations
  async getEventVersions(eventId: number): Promise<EventVersionWithAuthor[]> {
    return await db.select({
      id: eventVersions.id,
      eventId: eventVersions.eventId,
      version: eventVersions.version,
      category: eventVersions.category,
      block: eventVersions.block,
      action: eventVersions.action,
      actionDescription: eventVersions.actionDescription,
      name: eventVersions.name,
      valueDescription: eventVersions.valueDescription,
      owner: eventVersions.owner,
      platforms: eventVersions.platforms,
      implementationStatus: eventVersions.implementationStatus,
      validationStatus: eventVersions.validationStatus,
      properties: eventVersions.properties,
      notes: eventVersions.notes,
      changeDescription: eventVersions.changeDescription,
      authorId: eventVersions.authorId,
      authorName: users.name,
      createdAt: eventVersions.createdAt,
    })
      .from(eventVersions)
      .leftJoin(users, eq(eventVersions.authorId, users.id))
      .where(eq(eventVersions.eventId, eventId))
      .orderBy(desc(eventVersions.version));
  }

  async getEventVersion(eventId: number, version: number): Promise<EventVersionWithAuthor | undefined> {
    const [result] = await db.select({
      id: eventVersions.id,
      eventId: eventVersions.eventId,
      version: eventVersions.version,
      category: eventVersions.category,
      block: eventVersions.block,
      action: eventVersions.action,
      actionDescription: eventVersions.actionDescription,
      name: eventVersions.name,
      valueDescription: eventVersions.valueDescription,
      owner: eventVersions.owner,
      platforms: eventVersions.platforms,
      implementationStatus: eventVersions.implementationStatus,
      validationStatus: eventVersions.validationStatus,
      properties: eventVersions.properties,
      notes: eventVersions.notes,
      changeDescription: eventVersions.changeDescription,
      authorId: eventVersions.authorId,
      authorName: users.name,
      createdAt: eventVersions.createdAt,
    })
      .from(eventVersions)
      .leftJoin(users, eq(eventVersions.authorId, users.id))
      .where(and(
        eq(eventVersions.eventId, eventId),
        eq(eventVersions.version, version)
      ));
    return result;
  }

  async createEventVersion(version: InsertEventVersion): Promise<EventVersion> {
    const [newVersion] = await db.insert(eventVersions).values(version).returning();
    return newVersion;
  }

  // User operations
  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.name);
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async createUserWithPassword(user: InsertUser, passwordHash: string): Promise<User> {
    const [newUser] = await db.insert(users).values({ ...user, passwordHash }).returning();
    return newUser;
  }

  async updateUser(id: number, updates: Partial<InsertUser>, passwordHash?: string): Promise<User> {
    const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    if (passwordHash) {
      setValues.passwordHash = passwordHash;
    }
    const [user] = await db.update(users)
      .set(setValues)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Plugin operations
  async getPlugins(): Promise<Plugin[]> {
    return await db.select().from(plugins).orderBy(plugins.name);
  }

  async getPlugin(id: string): Promise<Plugin | undefined> {
    const [plugin] = await db.select().from(plugins).where(eq(plugins.id, id));
    return plugin;
  }

  async upsertPlugin(plugin: InsertPlugin): Promise<Plugin> {
    const existing = await this.getPlugin(plugin.id);
    if (existing) {
      const [updated] = await db.update(plugins)
        .set({ ...plugin, updatedAt: new Date() })
        .where(eq(plugins.id, plugin.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(plugins).values(plugin).returning();
    return created;
  }

  async updatePluginEnabled(id: string, isEnabled: boolean): Promise<Plugin> {
    const [plugin] = await db.update(plugins)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(plugins.id, id))
      .returning();
    return plugin;
  }
  
  async updatePluginConfig(id: string, config: any): Promise<Plugin> {
    const [plugin] = await db.update(plugins)
      .set({ config, updatedAt: new Date() })
      .where(eq(plugins.id, id))
      .returning();
    return plugin;
  }

  async deletePlugin(id: string): Promise<void> {
    await db.delete(plugins).where(eq(plugins.id, id));
  }

  // Transactional operations for atomic multi-step operations
  async createEventWithVersionAndStatuses(
    insertEvent: InsertEvent,
    versionData: Omit<InsertEventVersion, 'eventId'>,
    platforms: string[]
  ): Promise<Event> {
    return await db.transaction(async (tx) => {
      // Step 1: Create event
      const [event] = await tx.insert(events).values(insertEvent).returning();
      
      // Step 2: Create initial version
      await tx.insert(eventVersions).values({
        ...versionData,
        eventId: event.id,
      });
      
      // Step 3: Create platform statuses for version 1
      for (const platform of platforms) {
        await tx.insert(eventPlatformStatuses).values({
          eventId: event.id,
          versionNumber: 1,
          platform: platform as any,
          implementationStatus: "черновик",
          validationStatus: "ожидает_проверки"
        });
      }
      
      return event;
    });
  }

  async updateEventWithVersionAndStatuses(
    id: number,
    updates: UpdateEventRequest,
    versionData: Omit<InsertEventVersion, 'eventId'>,
    platforms: string[]
  ): Promise<Event> {
    return await db.transaction(async (tx) => {
      // Step 1: Update event
      const [event] = await tx.update(events)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning();
      
      // Step 2: Create new version snapshot
      await tx.insert(eventVersions).values({
        ...versionData,
        eventId: event.id,
      });
      
      // Step 3: Create platform statuses for new version
      const newVersion = versionData.version;
      for (const platform of platforms) {
        await tx.insert(eventPlatformStatuses).values({
          eventId: event.id,
          versionNumber: newVersion,
          platform: platform as any,
          implementationStatus: "черновик",
          validationStatus: "ожидает_проверки"
        });
      }
      
      return event;
    });
  }

  async deleteEventWithRelatedData(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Step 1: Delete status history for all platform statuses
      const platformStatuses = await tx.select()
        .from(eventPlatformStatuses)
        .where(eq(eventPlatformStatuses.eventId, id));
      
      for (const ps of platformStatuses) {
        await tx.delete(statusHistory).where(eq(statusHistory.eventPlatformStatusId, ps.id));
      }
      
      // Step 2: Delete platform statuses
      await tx.delete(eventPlatformStatuses).where(eq(eventPlatformStatuses.eventId, id));
      
      // Step 3: Delete event versions
      await tx.delete(eventVersions).where(eq(eventVersions.eventId, id));
      
      // Step 4: Delete comments
      await tx.delete(comments).where(eq(comments.eventId, id));
      
      // Step 5: Delete event
      await tx.delete(events).where(eq(events.id, id));
    });
  }
}

export const storage = new DatabaseStorage();
