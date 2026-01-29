# Sutochno.ru Analytics Event Schema Manager

**Repository**: https://github.com/GGrirorev/SutochnoEventManager

## Overview

This project is an analytics event schema management application for Sutochno.ru, designed to help teams define, track, and validate analytics events across various platforms (web, iOS, Android, backend). It aims to provide a centralized system for event monitoring, a comprehensive event catalog with property definitions, and a reusable property template library. The application supports full event versioning, detailed platform status tracking, user management with role-based access control, and a plugin system for extending functionality, including analytics monitoring and CSV imports.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS with CSS variables
- **Forms**: react-hook-form with Zod validation
- **Charts**: Recharts
- **Build Tool**: Vite

### Backend
- **Framework**: Express.js 5 with TypeScript
- **API Pattern**: RESTful API with typed routes (`shared/routes.ts`)
- **Validation**: Zod schemas (shared client/server)
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Transactions**: `db.transaction()` for atomic multi-step operations
- **Route Architecture**: Modular route structure in `server/routes/`:
  - `middleware.ts` - Authentication, CSRF, permissions
  - `auth.ts` - Login, logout, session management
  - `categories.ts` - Category CRUD operations
  - `events.ts` - Events CRUD, versions, platform statuses, comments, CSV import
  - `users.ts` - User management
  - `analytics.ts` - Matomo analytics proxy
  - `alerts.ts` - Alert monitoring and SSE endpoints
  - `plugins.ts` - Plugin management and seeding

### Data Model
The system manages:
- **Events**: Analytics events with categories, actions, names, descriptions, properties, owners, and authors.
- **Event Categories**: Separate table for categorization.
- **Event Versions**: Snapshots of event state at each edit, including version-specific platform statuses.
- **Event Platform Statuses**: Implementation and validation statuses per platform, with history.
- **Property Templates**: Reusable property definitions.
- **Comments**: Discussion threads for events.
- **Users**: Accounts with four roles: viewer, developer, analyst, admin.

### Authentication & Authorization
- **Authentication**: Session-based using `express-session` and `connect-pg-simple` for session storage. Passwords hashed with bcrypt.
- **Authorization**: Role-based access control (`requirePermission`) checking user roles against defined permissions (canViewEvents, canCreateEvents, etc.) for all API endpoints. CSRF protection is implemented.

### Plugin System
A modular architecture allows extending functionality with plugins.
- **Database**: `plugins` table stores plugin metadata and configuration.
- **API**: Endpoints for listing, retrieving, and toggling plugins.
- **Structure**: Plugins are self-contained folders with a `manifest.json`, `README.md`, and `index.tsx`.
- **Key Plugins**:
    - `code-generator`: Generates Matomo tracking code.
    - `analytics-chart`: Displays Matomo analytics charts with server-side caching.
    - `platform-statuses`: Manages platform implementation and validation statuses.
    - `comments`: Provides event discussion.
    - `csv-import`: Bulk event import from CSV with duplicate handling.

### Event Monitoring & Alerts (Independent Module)
Monitors analytics events for significant count drops between yesterday and the day before. This is an independent module with its own configuration.

**Configuration** (Admin only via `/alerts/settings`):
- **matomoUrl**: Base URL for Matomo API
- **matomoToken**: API authentication token (falls back to ANALYTICS_API_TOKEN env var)
- **matomoSiteId**: Platform to site ID mapping (format: `web:1,ios:2,android:3`)
- **dropThreshold**: Minimum drop percentage to trigger alert (default: 30%)
- **maxConcurrency**: Max parallel requests to API (default: 5)
- **isEnabled**: Enable/disable the module

**Database**: 
- `event_alerts` table stores alert details
- Alert configuration is stored in `plugins.config` for the 'alerts' plugin (no separate table)
- `events.excludeFromMonitoring` allows excluding events

**API Endpoints**:
  - `GET /api/alerts` — List alerts (all authenticated users)
  - `DELETE /api/alerts/:id` — Delete alert (admin and analyst only)
  - `POST /api/alerts/bulk-delete` — Bulk delete alerts (admin and analyst only)
  - `GET /api/alerts/settings` — Get alert settings (admin only)
  - `PUT /api/alerts/settings` — Update alert settings (admin only)
  - `GET /api/alerts/check-stream` — SSE stream for real-time check progress (authenticated users)
  - `POST /api/alerts/check` — Trigger check (for cron jobs, no auth required)

#### Настройка автоматической проверки (Cron)
Для ежедневной автоматической проверки падения событий настройте cron-задание:

**URL для вызова:**
```
POST https://your-domain.replit.app/api/alerts/check
```

**Рекомендуемое расписание:** ежедневно после 23:00 (чтобы данные за вчерашний день были полными)

**Примеры настройки:**
- **cron-job.org**: Создайте задание с методом POST на указанный URL
- **EasyCron**: Добавьте URL с методом POST и расписанием `0 23 * * *`
- **UptimeRobot**: Используйте "HTTP(s) Keyword" монитор с POST-запросом

**Ответ API:**
```json
{
  "message": "Проверка завершена",
  "alertsCreated": 2,
  "eventsChecked": 15
}
```

### Initial Setup
A setup wizard (`/setup`) is provided for the first administrator account creation when no users exist, making the system ready for use.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Database interaction.
- **connect-pg-simple**: For session storage.

### UI Frameworks & Libraries
- **Radix UI**: Core accessible UI primitives.
- **shadcn/ui**: Pre-styled component library.
- **Lucide React**: Icons.
- **Recharts**: Data visualization.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: Backend bundling.
- **TypeScript**: Language.
- **Tailwind CSS**: Styling.

### Validation
- **Zod**: Schema validation for data and API contracts.
- **drizzle-zod**: Zod schema generation from Drizzle.

## Recent Changes

### January 2026
- **Route Architecture Refactoring**: Refactored monolithic `routes.ts` (~2000 lines) into 8 modular components in `server/routes/` for better maintainability. Main routes.ts now ~90 lines with clean module imports.
- **Categories Management Page**: Added `/categories` page for managing event categories with descriptions. Categories show event count and cannot be deleted if they have associated events.
- **Alert Settings Migration**: Migrated alert settings from deprecated `alert_settings` table to `plugins.config` for the 'alerts' plugin. Automatic migration runs on startup.
- **Collapsible Sidebar**: Added collapsible sidebar functionality with localStorage persistence, tooltips for collapsed icons, and smooth animations. Sidebar state is managed via React Context (SidebarProvider/useSidebar).
- **EventEditSheet Component**: Created reusable component for event editing, used in both EventsList and AlertsPage
- **Type Safety Improvements**: Added `AuthenticatedRequest` interface in routes.ts for proper user type handling
- **Category Handling**: Updated storage methods to properly convert category string to categoryId internally
- **Form Data Types**: Created `EventFormData` type for proper form handling
- **Legacy Fields Removed**: Removed deprecated `implementationStatus` and `validationStatus` columns from events/event_versions tables. Status tracking now exclusively uses event_platform_statuses table.

## Database Indexes (High Load Optimization)

### Event Platform Statuses (7 индексов)
- `idx_eps_event_id` - быстрый поиск статусов события
- `idx_eps_implementation_status` - фильтрация по статусу внедрения
- `idx_eps_validation_status` - фильтрация по статусу валидации
- `idx_eps_event_version` - поиск по событию и версии
- `idx_eps_updated_at` - сортировка по дате обновления
- `unique_event_platform_version` - уникальность (event_id, platform, version)

### Status History (5 индексов)
- `idx_sh_platform_status_id` - JOIN со статусами платформ
- `idx_sh_created_at` - сортировка по дате создания
- `idx_sh_status_type` - фильтрация по типу статуса
- `idx_sh_changed_by_user` - поиск по автору изменения

### Event Versions (5 индексов)
- `idx_ev_event_id` - поиск версий события
- `idx_ev_event_version` - уникальная пара (event_id, version)
- `idx_ev_author_id` - фильтрация по автору
- `idx_ev_created_at` - сортировка по дате

### Events (8 индексов)
- `idx_events_category_action` - уникальность category+action
- `idx_events_action` - поиск по action
- `idx_events_platforms` - GIN индекс для массива платформ
- `idx_events_owner_id` - фильтрация по владельцу
- `idx_events_author_id` - фильтрация по автору
- `idx_events_created_at` - сортировка по дате
- `idx_events_exclude_monitoring` - partial индекс для мониторинга

### Event Alerts (6 индексов)
- `idx_alerts_event_id` - поиск алертов события
- `idx_alerts_is_resolved` - фильтрация по статусу решения
- `idx_alerts_checked_at` - сортировка по дате проверки
- `idx_alerts_event_platform` - дедупликация по событию и платформе
- `idx_alerts_drop_percent` - сортировка по проценту падения

### Comments (3 индекса)
- `idx_comments_event_id` - поиск комментариев события
- `idx_comments_created_at` - сортировка по дате

### User Login Logs (3 индекса)
- `idx_ull_user_id` - поиск логов пользователя
- `idx_ull_login_at` - сортировка по дате входа

## Keyset Pagination (High Load Optimization)

Реализована keyset-пагинация для наиболее нагруженных списков вместо традиционного offset/limit. Keyset-пагинация эффективнее на больших таблицах (O(1) vs O(n)), так как не требует сканирования всех предыдущих записей.

### Events: Гибридный подход
- **Без status-фильтров**: Keyset pagination с ORDER BY (createdAt DESC, id DESC)
- **С status-фильтрами** (implementationStatus, validationStatus, jira): Offset pagination (DISTINCT ON требует offset)
- Frontend `useEvents` автоматически определяет режим на основе фильтров

### API Параметры
- **Events** (`GET /api/events`): `cursorCreatedAt` + `cursorId` (или `offset` для status-фильтров)
- **Alerts** (`GET /api/alerts`): `cursorCreatedAt` + `cursorId`  
- **Login Logs** (`GET /api/login-logs`): `cursorLoginAt` + `cursorId`

### Ответ API
Все endpoint'ы возвращают:
```json
{
  "items": [...],
  "total": 100,
  "hasMore": true,
  "nextCursor": { "createdAt": "2026-01-29T12:00:00Z", "id": 42 }
}
```

### Limit+1 Pattern
hasMore определяется через запрос limit+1 записей: если rawResult.length > limit, значит есть ещё страницы.

### Backward Compatibility
Offset-пагинация остаётся доступной для обратной совместимости. Если `cursor*` параметры не переданы, используется `offset`.

## Known Technical Debt

1. **Type annotations in storage.ts**: Minor drizzle-orm/drizzle-zod type mismatches that don't affect runtime