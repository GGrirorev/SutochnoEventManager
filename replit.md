# Sutochno.ru Analytics Event Schema Manager

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

### Event Monitoring & Alerts
Monitors analytics events for significant count drops (30%+) between yesterday and the day before.
- **Mechanism**: Utilizes `analytics-chart` plugin's Matomo integration.
- **Database**: `event_alerts` table stores alert details; `events.excludeFromMonitoring` allows excluding events.
- **API Endpoints**:
  - `GET /api/alerts` — Список всех алертов (доступно всем авторизованным пользователям)
  - `DELETE /api/alerts/:id` — Удаление алерта (только admin и analyst)
  - `POST /api/alerts/check` — Запуск проверки событий (для cron-заданий, без авторизации)

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