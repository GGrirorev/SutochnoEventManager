import { db } from "./db";
import {
  events,
  comments,
  propertyTemplates,
  eventPlatformStatuses,
  statusHistory,
  eventVersions,
  eventCategories,
  users,
  userLoginLogs,
  plugins,
  eventAlerts,
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
  type EventCategory,
  type InsertEventCategory,
  type User,
  type InsertUser,
  type UserLoginLog,
  type Plugin,
  type InsertPlugin,
  type EventAlert,
  type InsertEventAlert,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS
} from "@shared/schema";

// Alert settings stored in plugins.config for 'alerts' plugin
export interface AlertConfig {
  matomoUrl?: string;
  matomoToken?: string | null;
  matomoSiteId?: string;
  dropThreshold?: number;
  maxConcurrency?: number;
  isEnabled?: boolean;
}
import { eq, ilike, and, or, desc, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type EventWithAuthor = Event & { authorName?: string | null; ownerName?: string | null; ownerDepartment?: string | null; category?: string | null };
export type EventVersionWithAuthor = EventVersion & { authorName?: string | null; category?: string | null };
export type UserLoginLogWithUser = UserLoginLog & { userName: string; userEmail: string };

export interface IStorage {
  getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    ownerId?: number;
    authorId?: number;
    implementationStatus?: string;
    validationStatus?: string;
    jira?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: EventWithAuthor[]; total: number; hasMore: boolean }>;
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
  deleteComment(id: number): Promise<void>;
  
  // Property template operations
  getPropertyTemplates(category?: string): Promise<PropertyTemplate[]>;
  getPropertyTemplate(id: number): Promise<PropertyTemplate | undefined>;
  createPropertyTemplate(template: InsertPropertyTemplate): Promise<PropertyTemplate>;
  updatePropertyTemplate(id: number, updates: Partial<InsertPropertyTemplate>): Promise<PropertyTemplate>;
  deletePropertyTemplate(id: number): Promise<void>;
  getNextDimension(): Promise<number>;
  
  // Event platform status operations (version-aware)
  getEventPlatformStatuses(eventId: number, versionNumber?: number): Promise<EventPlatformStatus[]>;
  getEventPlatformStatusesBatch(eventIds: number[], versionNumbers?: Map<number, number>): Promise<Map<number, EventPlatformStatus[]>>;
  getEventPlatformStatus(eventId: number, platform: string, versionNumber: number): Promise<EventPlatformStatus | undefined>;
  createEventPlatformStatus(status: InsertEventPlatformStatus): Promise<EventPlatformStatus>;
  updateEventPlatformStatus(id: number, updates: Partial<InsertEventPlatformStatus>): Promise<EventPlatformStatus>;
  deletePlatformStatus(id: number): Promise<void>;
  deleteEventPlatformStatuses(eventId: number): Promise<void>;
  createVersionPlatformStatuses(eventId: number, versionNumber: number, platforms: string[]): Promise<EventPlatformStatus[]>;
  
  // Status history operations
  getStatusHistory(eventPlatformStatusId: number): Promise<StatusHistory[]>;
  getStatusHistoryBatch(statusIds: number[]): Promise<Map<number, (StatusHistory & { changedByUserName?: string })[]>>;
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
  
  // User login log operations
  recordLoginLog(userId: number, ipAddress?: string, userAgent?: string): Promise<void>;
  getLoginLogs(limit?: number, offset?: number): Promise<{ logs: UserLoginLogWithUser[]; total: number }>;
  getUserLoginLogs(userId: number, limit?: number): Promise<UserLoginLog[]>;
  
  // Plugin operations
  getPlugins(): Promise<Plugin[]>;
  getPlugin(id: string): Promise<Plugin | undefined>;
  upsertPlugin(plugin: InsertPlugin): Promise<Plugin>;
  updatePluginEnabled(id: string, isEnabled: boolean): Promise<Plugin>;
  updatePluginConfig(id: string, config: any): Promise<Plugin>;
  deletePlugin(id: string): Promise<void>;
  
  // Category operations
  getCategories(): Promise<EventCategory[]>;
  getCategoriesWithEventCount(): Promise<(EventCategory & { eventCount: number })[]>;
  getEventCountByCategory(categoryId: number): Promise<number>;
  getCategoryByName(name: string): Promise<EventCategory | undefined>;
  createCategory(category: InsertEventCategory): Promise<EventCategory>;
  getOrCreateCategory(name: string): Promise<EventCategory>;
  updateCategory(id: number, updates: Partial<InsertEventCategory>): Promise<EventCategory>;
  deleteCategory(id: number): Promise<void>;
  getCategoryById(id: number): Promise<EventCategory | undefined>;
  
  // Alert operations
  getAlerts(limit?: number, offset?: number): Promise<{ alerts: (EventAlert & { ownerId: number | null; ownerName: string | null })[]; total: number }>;
  createAlert(alert: InsertEventAlert): Promise<EventAlert>;
  deleteAlert(id: number): Promise<void>;
  getEventsForMonitoring(): Promise<{ id: number; category: string; action: string; platforms: string[] }[]>;
  
  // Alert settings operations (stored in plugins.config)
  getAlertSettings(): Promise<AlertConfig | undefined>;
  updateAlertSettings(settings: Partial<AlertConfig>): Promise<AlertConfig>;
}

export class DatabaseStorage implements IStorage {
  async getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    ownerId?: number;
    authorId?: number;
    implementationStatus?: string;
    validationStatus?: string;
    jira?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: EventWithAuthor[]; total: number; hasMore: boolean }> {
    const conditions = [];
    const needStatusJoin = filters?.implementationStatus || filters?.validationStatus || filters?.jira;

    if (filters?.search) {
      conditions.push(
        or(
          ilike(events.action, `%${filters.search}%`),
          ilike(events.actionDescription, `%${filters.search}%`)
        )
      );
    }
    if (filters?.category) {
      conditions.push(eq(eventCategories.name, filters.category));
    }
    if (filters?.platform) {
      conditions.push(sql`${events.platforms} @> ARRAY[${filters.platform}]::text[]`);
    }
    if (filters?.ownerId) {
      conditions.push(eq(events.ownerId, filters.ownerId));
    }
    if (filters?.authorId) {
      conditions.push(eq(events.authorId, filters.authorId));
    }
    if (filters?.implementationStatus) {
      conditions.push(eq(eventPlatformStatuses.implementationStatus, filters.implementationStatus));
    }
    if (filters?.validationStatus) {
      conditions.push(eq(eventPlatformStatuses.validationStatus, filters.validationStatus));
    }
    // Jira filter is handled separately via subquery since jira links are in status_history
    const jiraFilter = filters?.jira;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Build status join condition - include platform constraint if platform filter is set
    const statusJoinCondition = filters?.platform
      ? and(
          eq(eventPlatformStatuses.eventId, events.id),
          eq(eventPlatformStatuses.versionNumber, events.currentVersion),
          eq(eventPlatformStatuses.platform, filters.platform)
        )
      : and(
          eq(eventPlatformStatuses.eventId, events.id),
          eq(eventPlatformStatuses.versionNumber, events.currentVersion)
        );

    // Build count query with optional status join
    let countQuery = db
      .select({ count: sql<number>`count(DISTINCT ${events.id})::int` })
      .from(events)
      .leftJoin(eventCategories, eq(events.categoryId, eventCategories.id));
    
    if (needStatusJoin) {
      countQuery = countQuery.leftJoin(
        eventPlatformStatuses,
        statusJoinCondition
      ) as typeof countQuery;
    }
    
    // Add jira filter condition via subquery on status_history
    let finalCountCondition = whereClause;
    if (jiraFilter) {
      const jiraCondition = sql`EXISTS (
        SELECT 1 FROM ${statusHistory} sh
        JOIN ${eventPlatformStatuses} eps ON eps.id = sh.event_platform_status_id
        WHERE eps.event_id = ${events.id} AND sh.jira_link ILIKE ${'%' + jiraFilter + '%'}
      )`;
      finalCountCondition = whereClause ? and(whereClause, jiraCondition) : jiraCondition;
    }

    const [countResult] = await countQuery.where(finalCountCondition);
    const total = countResult?.count ?? 0;

    const ownerUsers = alias(users, "owner_users");
    
    // Build main query with optional status join
    let mainQuery = db.selectDistinctOn([events.id], {
      id: events.id,
      categoryId: events.categoryId,
      category: eventCategories.name,
      block: events.block,
      action: events.action,
      actionDescription: events.actionDescription,
      name: events.name,
      valueDescription: events.valueDescription,
      ownerId: events.ownerId,
      ownerName: ownerUsers.name,
      ownerDepartment: ownerUsers.department,
      authorId: events.authorId,
      authorName: users.name,
      platforms: events.platforms,
      properties: events.properties,
      notes: events.notes,
      currentVersion: events.currentVersion,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      excludeFromMonitoring: events.excludeFromMonitoring,
    })
      .from(events)
      .leftJoin(users, eq(events.authorId, users.id))
      .leftJoin(ownerUsers, eq(events.ownerId, ownerUsers.id))
      .leftJoin(eventCategories, eq(events.categoryId, eventCategories.id));
    
    if (needStatusJoin) {
      mainQuery = mainQuery.leftJoin(
        eventPlatformStatuses,
        statusJoinCondition
      ) as typeof mainQuery;
    }
    
    // Apply the same jira condition to main query
    let finalMainCondition = whereClause;
    if (jiraFilter) {
      const jiraCondition = sql`EXISTS (
        SELECT 1 FROM ${statusHistory} sh
        JOIN ${eventPlatformStatuses} eps ON eps.id = sh.event_platform_status_id
        WHERE eps.event_id = ${events.id} AND sh.jira_link ILIKE ${'%' + jiraFilter + '%'}
      )`;
      finalMainCondition = whereClause ? and(whereClause, jiraCondition) : jiraCondition;
    }
    
    const result = await mainQuery
      .where(finalMainCondition)
      .orderBy(events.id, desc(events.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      events: result,
      total,
      hasMore: offset + result.length < total,
    };
  }

  async getEvent(id: number): Promise<EventWithAuthor | undefined> {
    const ownerUsers = alias(users, "owner_users");
    const [event] = await db.select({
      id: events.id,
      categoryId: events.categoryId,
      category: eventCategories.name,
      block: events.block,
      action: events.action,
      actionDescription: events.actionDescription,
      name: events.name,
      valueDescription: events.valueDescription,
      ownerId: events.ownerId,
      ownerName: ownerUsers.name,
      ownerDepartment: ownerUsers.department,
      authorId: events.authorId,
      authorName: users.name,
      platforms: events.platforms,
      properties: events.properties,
      notes: events.notes,
      currentVersion: events.currentVersion,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      excludeFromMonitoring: events.excludeFromMonitoring,
    })
      .from(events)
      .leftJoin(users, eq(events.authorId, users.id))
      .leftJoin(ownerUsers, eq(events.ownerId, ownerUsers.id))
      .leftJoin(eventCategories, eq(events.categoryId, eventCategories.id))
      .where(eq(events.id, id));
    return event;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    // Convert category string to categoryId
    const categoryRecord = await this.getOrCreateCategory(insertEvent.category);
    const { category, ...restEvent } = insertEvent;
    const [event] = await db.insert(events).values({
      ...restEvent,
      categoryId: categoryRecord.id,
    }).returning();
    return event;
  }

  async updateEvent(id: number, updates: UpdateEventRequest): Promise<Event> {
    // Convert category string to categoryId if provided
    let categoryId: number | undefined;
    if (updates.category) {
      const categoryRecord = await this.getOrCreateCategory(updates.category);
      categoryId = categoryRecord.id;
    }
    const { category, ...restUpdates } = updates;
    const [event] = await db.update(events)
      .set({ ...restUpdates, ...(categoryId && { categoryId }), updatedAt: new Date() })
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
    // Count total events
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(events);
    const total = countResult?.count ?? 0;
    
    // Initialize status counts
    const byImplementationStatus: Record<string, number> = {};
    IMPLEMENTATION_STATUS.forEach(s => byImplementationStatus[s] = 0);
    
    const byValidationStatus: Record<string, number> = {};
    VALIDATION_STATUS.forEach(s => byValidationStatus[s] = 0);

    // Use SQL GROUP BY instead of fetching all records
    const implCounts = await db
      .select({ 
        status: eventPlatformStatuses.implementationStatus, 
        count: sql<number>`count(*)::int` 
      })
      .from(eventPlatformStatuses)
      .groupBy(eventPlatformStatuses.implementationStatus);
    
    implCounts.forEach(row => {
      if (row.status && byImplementationStatus.hasOwnProperty(row.status)) {
        byImplementationStatus[row.status] = row.count;
      }
    });

    const valCounts = await db
      .select({ 
        status: eventPlatformStatuses.validationStatus, 
        count: sql<number>`count(*)::int` 
      })
      .from(eventPlatformStatuses)
      .groupBy(eventPlatformStatuses.validationStatus);
    
    valCounts.forEach(row => {
      if (row.status && byValidationStatus.hasOwnProperty(row.status)) {
        byValidationStatus[row.status] = row.count;
      }
    });

    return {
      total,
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

  async deleteComment(id: number): Promise<void> {
    await db.delete(comments).where(eq(comments.id, id));
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

  async getEventPlatformStatusesBatch(eventIds: number[], versionNumbers?: Map<number, number>): Promise<Map<number, EventPlatformStatus[]>> {
    if (eventIds.length === 0) {
      return new Map();
    }
    
    const statuses = await db.select()
      .from(eventPlatformStatuses)
      .where(inArray(eventPlatformStatuses.eventId, eventIds))
      .orderBy(eventPlatformStatuses.eventId, eventPlatformStatuses.platform);
    
    const result = new Map<number, EventPlatformStatus[]>();
    
    for (const eventId of eventIds) {
      result.set(eventId, []);
    }
    
    for (const status of statuses) {
      // Filter by version if specified
      if (versionNumbers && versionNumbers.has(status.eventId)) {
        const targetVersion = versionNumbers.get(status.eventId);
        if (status.versionNumber !== targetVersion) {
          continue;
        }
      }
      
      const list = result.get(status.eventId);
      if (list) {
        list.push(status);
      }
    }
    
    return result;
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
    // Delete status history using subquery (single query instead of N+1)
    await db.delete(statusHistory).where(
      sql`${statusHistory.eventPlatformStatusId} IN (
        SELECT id FROM event_platform_statuses WHERE event_id = ${eventId}
      )`
    );
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
  async getStatusHistory(eventPlatformStatusId: number): Promise<(StatusHistory & { changedByUserName?: string })[]> {
    return await db.select({
      id: statusHistory.id,
      eventPlatformStatusId: statusHistory.eventPlatformStatusId,
      statusType: statusHistory.statusType,
      oldStatus: statusHistory.oldStatus,
      newStatus: statusHistory.newStatus,
      changedBy: statusHistory.changedBy,
      changedByUserId: statusHistory.changedByUserId,
      comment: statusHistory.comment,
      jiraLink: statusHistory.jiraLink,
      createdAt: statusHistory.createdAt,
      changedByUserName: users.name,
    })
      .from(statusHistory)
      .leftJoin(users, eq(statusHistory.changedByUserId, users.id))
      .where(eq(statusHistory.eventPlatformStatusId, eventPlatformStatusId))
      .orderBy(desc(statusHistory.createdAt));
  }

  async getStatusHistoryBatch(statusIds: number[]): Promise<Map<number, (StatusHistory & { changedByUserName?: string })[]>> {
    if (statusIds.length === 0) {
      return new Map();
    }
    
    const histories = await db.select({
      id: statusHistory.id,
      eventPlatformStatusId: statusHistory.eventPlatformStatusId,
      statusType: statusHistory.statusType,
      oldStatus: statusHistory.oldStatus,
      newStatus: statusHistory.newStatus,
      changedBy: statusHistory.changedBy,
      changedByUserId: statusHistory.changedByUserId,
      comment: statusHistory.comment,
      jiraLink: statusHistory.jiraLink,
      createdAt: statusHistory.createdAt,
      changedByUserName: users.name,
    })
      .from(statusHistory)
      .leftJoin(users, eq(statusHistory.changedByUserId, users.id))
      .where(inArray(statusHistory.eventPlatformStatusId, statusIds))
      .orderBy(desc(statusHistory.createdAt));
    
    const result = new Map<number, (StatusHistory & { changedByUserName?: string })[]>();
    
    for (const statusId of statusIds) {
      result.set(statusId, []);
    }
    
    for (const history of histories) {
      const list = result.get(history.eventPlatformStatusId);
      if (list) {
        list.push(history);
      }
    }
    
    return result;
  }

  async createStatusHistory(history: InsertStatusHistory): Promise<StatusHistory> {
    const [newHistory] = await db.insert(statusHistory).values(history).returning();
    return newHistory;
  }

  // Event version operations
  async getEventVersions(eventId: number): Promise<(EventVersionWithAuthor & { category?: string })[]> {
    return await db.select({
      id: eventVersions.id,
      eventId: eventVersions.eventId,
      version: eventVersions.version,
      categoryId: eventVersions.categoryId,
      category: eventCategories.name,
      block: eventVersions.block,
      action: eventVersions.action,
      actionDescription: eventVersions.actionDescription,
      name: eventVersions.name,
      valueDescription: eventVersions.valueDescription,
      ownerId: eventVersions.ownerId,
      platforms: eventVersions.platforms,
      properties: eventVersions.properties,
      notes: eventVersions.notes,
      changeDescription: eventVersions.changeDescription,
      authorId: eventVersions.authorId,
      authorName: users.name,
      createdAt: eventVersions.createdAt,
    })
      .from(eventVersions)
      .leftJoin(users, eq(eventVersions.authorId, users.id))
      .leftJoin(eventCategories, eq(eventVersions.categoryId, eventCategories.id))
      .where(eq(eventVersions.eventId, eventId))
      .orderBy(desc(eventVersions.version));
  }

  async getEventVersion(eventId: number, version: number): Promise<(EventVersionWithAuthor & { category?: string }) | undefined> {
    const [result] = await db.select({
      id: eventVersions.id,
      eventId: eventVersions.eventId,
      version: eventVersions.version,
      categoryId: eventVersions.categoryId,
      category: eventCategories.name,
      block: eventVersions.block,
      action: eventVersions.action,
      actionDescription: eventVersions.actionDescription,
      name: eventVersions.name,
      valueDescription: eventVersions.valueDescription,
      ownerId: eventVersions.ownerId,
      platforms: eventVersions.platforms,
      properties: eventVersions.properties,
      notes: eventVersions.notes,
      changeDescription: eventVersions.changeDescription,
      authorId: eventVersions.authorId,
      authorName: users.name,
      createdAt: eventVersions.createdAt,
    })
      .from(eventVersions)
      .leftJoin(users, eq(eventVersions.authorId, users.id))
      .leftJoin(eventCategories, eq(eventVersions.categoryId, eventCategories.id))
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
  
  // User login log operations
  async recordLoginLog(userId: number, ipAddress?: string, userAgent?: string): Promise<void> {
    const now = new Date();
    // Record login log
    await db.insert(userLoginLogs).values({
      userId,
      loginAt: now,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });
    // Update user's lastLoginAt
    await db.update(users)
      .set({ lastLoginAt: now })
      .where(eq(users.id, userId));
  }
  
  async getLoginLogs(limit: number = 100, offset: number = 0): Promise<{ logs: UserLoginLogWithUser[]; total: number }> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userLoginLogs);
    
    const total = countResult?.count || 0;
    
    const logs = await db
      .select({
        id: userLoginLogs.id,
        userId: userLoginLogs.userId,
        loginAt: userLoginLogs.loginAt,
        ipAddress: userLoginLogs.ipAddress,
        userAgent: userLoginLogs.userAgent,
        userName: users.name,
        userEmail: users.email,
      })
      .from(userLoginLogs)
      .leftJoin(users, eq(userLoginLogs.userId, users.id))
      .orderBy(desc(userLoginLogs.loginAt))
      .limit(limit)
      .offset(offset);
    
    return {
      logs: logs.map(log => ({
        ...log,
        userName: log.userName || "Удаленный пользователь",
        userEmail: log.userEmail || "",
      })),
      total,
    };
  }
  
  async getUserLoginLogs(userId: number, limit: number = 10): Promise<UserLoginLog[]> {
    return await db
      .select()
      .from(userLoginLogs)
      .where(eq(userLoginLogs.userId, userId))
      .orderBy(desc(userLoginLogs.loginAt))
      .limit(limit);
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

  // Helper function to get or create category within a transaction
  private async getOrCreateCategoryTx(tx: any, name: string): Promise<EventCategory> {
    const [existing] = await tx.select().from(eventCategories).where(eq(eventCategories.name, name));
    if (existing) return existing;
    const [newCategory] = await tx.insert(eventCategories).values({ name }).returning();
    return newCategory;
  }

  // Transactional operations for atomic multi-step operations
  async createEventWithVersionAndStatuses(
    insertEvent: InsertEvent,
    versionData: Omit<InsertEventVersion, 'eventId' | 'categoryId'>,
    platforms: string[],
    categoryName?: string
  ): Promise<Event> {
    return await db.transaction(async (tx) => {
      // Step 0: Create or get category within transaction
      // Use categoryName if provided, otherwise use insertEvent.category
      const catName = categoryName || insertEvent.category;
      const categoryRecord = await this.getOrCreateCategoryTx(tx, catName);
      const categoryId = categoryRecord.id;
      
      // Step 1: Create event (exclude category string, use categoryId)
      const { category: _cat, ...restEvent } = insertEvent;
      const [event] = await tx.insert(events).values({ ...restEvent, categoryId }).returning();
      
      // Step 2: Create initial version
      await tx.insert(eventVersions).values({
        ...versionData,
        categoryId,
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
    versionData: Omit<InsertEventVersion, 'eventId' | 'categoryId'>,
    platforms: string[],
    categoryName?: string
  ): Promise<Event> {
    return await db.transaction(async (tx) => {
      // Step 0: Create or get category within transaction
      // Use categoryName if provided, otherwise use updates.category
      const catName = categoryName || updates.category;
      let categoryId: number | undefined;
      if (catName) {
        const categoryRecord = await this.getOrCreateCategoryTx(tx, catName);
        categoryId = categoryRecord.id;
      }
      
      // Step 1: Update event (exclude category string, use categoryId)
      const { category: _cat, ...restUpdates } = updates;
      const [event] = await tx.update(events)
        .set({ ...restUpdates, ...(categoryId && { categoryId }), updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning();
      
      // Step 2: Create new version snapshot
      await tx.insert(eventVersions).values({
        ...versionData,
        categoryId,
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

  async updateEventWithoutNewVersion(
    id: number,
    updates: any,
    currentVersion: number,
    categoryName?: string
  ): Promise<Event> {
    return await db.transaction(async (tx) => {
      // Step 0: Create or get category within transaction (if categoryName provided)
      let categoryId = updates.categoryId;
      if (categoryName) {
        const category = await this.getOrCreateCategoryTx(tx, categoryName);
        categoryId = category.id;
      }
      
      // Step 1: Update event (without changing currentVersion)
      const [event] = await tx.update(events)
        .set({ ...updates, categoryId, updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning();
      
      // Step 2: Update current version snapshot with non-versioned fields
      await tx.update(eventVersions)
        .set({
          categoryId,
          block: updates.block,
          actionDescription: updates.actionDescription,
          ownerId: updates.ownerId,
          platforms: updates.platforms,
          notes: updates.notes,
        })
        .where(and(
          eq(eventVersions.eventId, id),
          eq(eventVersions.version, currentVersion)
        ));
      
      // Step 3: Update platform statuses if platforms changed
      if (updates.platforms) {
        const existingStatuses = await tx.select()
          .from(eventPlatformStatuses)
          .where(and(
            eq(eventPlatformStatuses.eventId, id),
            eq(eventPlatformStatuses.versionNumber, currentVersion)
          ));
        
        const existingPlatforms = existingStatuses.map(s => s.platform);
        const newPlatforms = updates.platforms as string[];
        
        // Add new platforms
        for (const platform of newPlatforms) {
          if (!existingPlatforms.includes(platform)) {
            await tx.insert(eventPlatformStatuses).values({
              eventId: id,
              versionNumber: currentVersion,
              platform: platform as any,
              implementationStatus: "черновик",
              validationStatus: "ожидает_проверки"
            });
          }
        }
        
        // Remove platforms that are no longer in the list
        for (const status of existingStatuses) {
          if (!newPlatforms.includes(status.platform)) {
            await tx.delete(eventPlatformStatuses)
              .where(eq(eventPlatformStatuses.id, status.id));
          }
        }
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

  // Category operations
  async getCategories(): Promise<EventCategory[]> {
    return db.select().from(eventCategories).orderBy(eventCategories.name);
  }

  async getCategoriesWithEventCount(): Promise<(EventCategory & { eventCount: number })[]> {
    const result = await db
      .select({
        id: eventCategories.id,
        name: eventCategories.name,
        description: eventCategories.description,
        createdAt: eventCategories.createdAt,
        eventCount: sql<number>`count(${events.id})::int`,
      })
      .from(eventCategories)
      .leftJoin(events, eq(events.categoryId, eventCategories.id))
      .groupBy(eventCategories.id)
      .orderBy(eventCategories.name);
    return result;
  }

  async getEventCountByCategory(categoryId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(eq(events.categoryId, categoryId));
    return result?.count ?? 0;
  }

  async getCategoryByName(name: string): Promise<EventCategory | undefined> {
    const [category] = await db.select()
      .from(eventCategories)
      .where(eq(eventCategories.name, name));
    return category;
  }

  async createCategory(category: InsertEventCategory): Promise<EventCategory> {
    const [newCategory] = await db.insert(eventCategories)
      .values(category)
      .returning();
    return newCategory;
  }

  async getOrCreateCategory(name: string): Promise<EventCategory> {
    const existing = await this.getCategoryByName(name);
    if (existing) return existing;
    return this.createCategory({ name });
  }

  async getCategoryById(id: number): Promise<EventCategory | undefined> {
    const [category] = await db.select().from(eventCategories).where(eq(eventCategories.id, id));
    return category;
  }

  async updateCategory(id: number, updates: Partial<InsertEventCategory>): Promise<EventCategory> {
    const [updated] = await db
      .update(eventCategories)
      .set(updates)
      .where(eq(eventCategories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(eventCategories).where(eq(eventCategories.id, id));
  }

  // Alert operations
  async getAlerts(limit = 100, offset = 0): Promise<{ alerts: (EventAlert & { ownerId: number | null; ownerName: string | null })[]; total: number }> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventAlerts);
    
    const total = countResult?.count ?? 0;
    
    const alertsWithOwner = await db
      .select({
        id: eventAlerts.id,
        eventId: eventAlerts.eventId,
        platform: eventAlerts.platform,
        eventCategory: eventAlerts.eventCategory,
        eventAction: eventAlerts.eventAction,
        yesterdayCount: eventAlerts.yesterdayCount,
        dayBeforeCount: eventAlerts.dayBeforeCount,
        dropPercent: eventAlerts.dropPercent,
        checkedAt: eventAlerts.checkedAt,
        isResolved: eventAlerts.isResolved,
        resolvedBy: eventAlerts.resolvedBy,
        resolvedAt: eventAlerts.resolvedAt,
        createdAt: eventAlerts.createdAt,
        ownerId: events.ownerId,
        ownerName: users.name,
      })
      .from(eventAlerts)
      .leftJoin(events, eq(eventAlerts.eventId, events.id))
      .leftJoin(users, eq(events.ownerId, users.id))
      .orderBy(desc(eventAlerts.createdAt))
      .limit(limit)
      .offset(offset);
    
    return { alerts: alertsWithOwner, total };
  }

  async createAlert(alert: InsertEventAlert): Promise<EventAlert> {
    const [newAlert] = await db.insert(eventAlerts)
      .values(alert)
      .returning();
    return newAlert;
  }

  async deleteAlert(id: number): Promise<void> {
    await db.delete(eventAlerts).where(eq(eventAlerts.id, id));
  }

  async getEventsForMonitoring(): Promise<{ id: number; category: string; action: string; platforms: string[] }[]> {
    const result = await db.select({
      id: events.id,
      category: eventCategories.name,
      action: events.action,
      platforms: events.platforms,
    })
      .from(events)
      .leftJoin(eventCategories, eq(events.categoryId, eventCategories.id))
      .where(eq(events.excludeFromMonitoring, false));
    
    return result.map(r => ({
      id: r.id,
      category: r.category || '',
      action: r.action,
      platforms: r.platforms as string[],
    }));
  }

  async getAlertSettings(): Promise<AlertConfig | undefined> {
    const [plugin] = await db.select().from(plugins).where(eq(plugins.id, 'alerts')).limit(1);
    if (!plugin) return undefined;
    
    const config = plugin.config as AlertConfig | null;
    return {
      matomoUrl: config?.matomoUrl || '',
      matomoToken: config?.matomoToken || null,
      matomoSiteId: config?.matomoSiteId || '',
      dropThreshold: config?.dropThreshold || 30,
      maxConcurrency: config?.maxConcurrency || 5,
      isEnabled: plugin.isEnabled,
    };
  }

  async updateAlertSettings(updates: Partial<AlertConfig>): Promise<AlertConfig> {
    const [plugin] = await db.select().from(plugins).where(eq(plugins.id, 'alerts')).limit(1);
    
    if (!plugin) {
      throw new Error('Plugin alerts not found');
    }
    
    const currentConfig = (plugin.config as AlertConfig) || {};
    const newConfig: AlertConfig = {
      ...currentConfig,
      ...(updates.matomoUrl !== undefined && { matomoUrl: updates.matomoUrl }),
      ...(updates.matomoToken !== undefined && { matomoToken: updates.matomoToken }),
      ...(updates.matomoSiteId !== undefined && { matomoSiteId: updates.matomoSiteId }),
      ...(updates.dropThreshold !== undefined && { dropThreshold: updates.dropThreshold }),
      ...(updates.maxConcurrency !== undefined && { maxConcurrency: updates.maxConcurrency }),
    };
    
    const updateData: { config: AlertConfig; isEnabled?: boolean; updatedAt: Date } = {
      config: newConfig,
      updatedAt: new Date(),
    };
    
    if (updates.isEnabled !== undefined) {
      updateData.isEnabled = updates.isEnabled;
    }
    
    await db.update(plugins)
      .set(updateData)
      .where(eq(plugins.id, 'alerts'));
    
    return {
      ...newConfig,
      isEnabled: updates.isEnabled ?? plugin.isEnabled,
    };
  }
  // Optimized: Check if event exists by category + action (uses index)
  async checkEventExistsByCategoryAction(categoryName: string, action: string): Promise<{ id: number; currentVersion: number } | null> {
    const result = await db
      .select({ id: events.id, currentVersion: events.currentVersion })
      .from(events)
      .innerJoin(eventCategories, eq(events.categoryId, eventCategories.id))
      .where(and(eq(eventCategories.name, categoryName), eq(events.action, action)))
      .limit(1);
    
    return result[0] || null;
  }

  // Optimized: Batch check multiple events for import preview (uses index)
  async checkEventsExistBatch(eventsToCheck: { category: string; action: string }[]): Promise<Map<string, { id: number; currentVersion: number }>> {
    if (eventsToCheck.length === 0) return new Map();
    
    // Get all unique categories first
    const uniqueCategories = [...new Set(eventsToCheck.map(e => e.category))];
    
    // Get category IDs
    const categoryRows = await db
      .select({ id: eventCategories.id, name: eventCategories.name })
      .from(eventCategories)
      .where(sql`${eventCategories.name} IN (${sql.join(uniqueCategories.map(c => sql`${c}`), sql`, `)})`);
    
    const categoryMap = new Map(categoryRows.map(c => [c.name, c.id]));
    
    // Build conditions for batch query
    const conditions = eventsToCheck
      .filter(e => categoryMap.has(e.category))
      .map(e => and(eq(events.categoryId, categoryMap.get(e.category)!), eq(events.action, e.action)));
    
    if (conditions.length === 0) return new Map();
    
    const existingEvents = await db
      .select({ 
        id: events.id, 
        categoryId: events.categoryId,
        action: events.action, 
        currentVersion: events.currentVersion,
        categoryName: eventCategories.name
      })
      .from(events)
      .innerJoin(eventCategories, eq(events.categoryId, eventCategories.id))
      .where(or(...conditions));
    
    const resultMap = new Map<string, { id: number; currentVersion: number }>();
    for (const event of existingEvents) {
      const key = `${event.categoryName}:${event.action}`;
      resultMap.set(key, { id: event.id, currentVersion: event.currentVersion || 1 });
    }
    
    return resultMap;
  }
}

export const storage = new DatabaseStorage();
