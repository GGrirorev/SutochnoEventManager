# Suточно.ру Analytics Event Schema Manager

## Overview

This is an analytics event schema management application for Suточно.ру (a Russian vacation rental platform). The system allows teams to define, track, and validate analytics events across multiple platforms (web, iOS, Android, backend). It provides a dashboard for monitoring event implementation status, a comprehensive event catalog with property definitions, and a reusable property template library.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Forms**: react-hook-form with Zod validation
- **Charts**: Recharts for dashboard analytics visualization
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **API Pattern**: RESTful API with typed routes defined in `shared/routes.ts`
- **Validation**: Zod schemas shared between client and server
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Development**: Hot module replacement via Vite middleware

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # UI components including shadcn/ui
│       ├── hooks/        # Custom React hooks for data fetching
│       ├── pages/        # Page components (Dashboard, EventsList, PropertiesPage)
│       └── lib/          # Utilities and query client configuration
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database operations layer
│   └── db.ts         # Database connection
├── shared/           # Code shared between client and server
│   ├── schema.ts     # Drizzle database schema and Zod types
│   └── routes.ts     # API route definitions with type-safe contracts
└── migrations/       # Drizzle database migrations
```

### Data Model
The application tracks:
- **Events**: Analytics events with category, action, name, description, and properties
- **Event Versions**: Snapshots of event state at each edit, enabling full version history
- **Event Platform Statuses**: Per-platform implementation and validation statuses with history
- **Property Templates**: Reusable property definitions that can be applied to events
- **Comments**: Discussion threads attached to events
- **Users**: User accounts with role-based access control

### User Management System
Users have four access levels (roles):
- **viewer** (Только просмотр): Can only view events and properties
- **developer** (Разработчик): Can view events and change platform statuses
- **analyst** (Аналитик): Can create/edit events and change statuses
- **admin** (Администратор): Full access including user management

User CRUD API: `/api/users` (GET, POST), `/api/users/:id` (GET, PATCH, DELETE)
User management UI is accessible via "Пользователи" link in sidebar under "Администрирование" section.

### Authentication System
- **Session-based authentication** using express-session with PostgreSQL store (connect-pg-simple)
- **Password hashing** with bcrypt (10 rounds)
- **Protected routes** on frontend using ProtectedRoute wrapper that redirects to /login
- **Session storage** in `session` table (auto-created)

Auth API endpoints:
- `POST /api/auth/login` - Login with email/password, returns user data
- `POST /api/auth/logout` - Destroys session
- `GET /api/auth/me` - Returns current authenticated user

Required environment variable: `SESSION_SECRET` (mandatory in production)

### Initial Setup (Setup Wizard)
When the system is first deployed with no users, it redirects to `/setup` page where the first administrator account can be created. After setup completion:
- The administrator is automatically logged in
- The setup page becomes inaccessible
- Standard login flow is required for subsequent users

Setup API endpoints:
- `GET /api/setup/status` - Returns { isConfigured: boolean, hasUsers: boolean }
- `POST /api/setup` - Creates first admin user (only works when no users exist)

See `INSTALL.md` for complete installation and deployment instructions.

Events have two status dimensions:
- **Implementation Status**: черновик (draft), в_разработке (in development), внедрено (implemented), архив (archived)
- **Validation Status**: ожидает_проверки (pending), корректно (correct), ошибка (error), предупреждение (warning)

### Versioning System
- Events start at v1 when created
- Each edit creates a new version (v2, v3, etc.) with change description
- Version selector dropdown in event details modal allows viewing historical snapshots
- Both "Описание" (Description) and "Здоровье" (Health) tabs show version-specific data when viewing old versions
- Current version data comes from live database; historical versions come from snapshots

### Version-Specific Platform Statuses
- Each version has its own independent platform statuses (implementation & validation)
- When a new version is created, default statuses are set: "черновик" / "ожидает_проверки"
- Old versions can be edited (their statuses can be changed) since they may be supported in parallel
- API: GET /api/events/:id/platform-statuses?version=N returns statuses for specific version
- API: PATCH includes versionNumber to update the correct version's status
- Status history is tracked separately per version

### API Design
Routes are defined declaratively in `shared/routes.ts` with Zod schemas for input/output validation. This provides type safety across the full stack. The pattern uses:
- Method and path definitions
- Input validation schemas
- Response type definitions for each status code

### Plugin System (Модульная архитектура)
The application supports modular extensions through a plugin system. Plugins can add new functionality that integrates with the event catalog.

**Database Schema:**
- `plugins` table: id (PK), name, description, version, isEnabled, config (JSONB), installedAt, updatedAt

**Plugin API Endpoints:**
- `GET /api/plugins` - List all plugins (public to authenticated users)
- `GET /api/plugins/:id` - Get single plugin details
- `PATCH /api/plugins/:id` - Toggle plugin enabled state (admin-only)

**Plugin Structure:**
Each plugin is a self-contained folder in `client/src/plugins/<plugin-id>/`:
- `manifest.json` - Plugin metadata (name, description, version)
- `README.md` - Plugin documentation
- `index.tsx` - React component with plugin logic

**Frontend Integration:**
- `usePlugins()` hook - Fetch all plugins
- `useIsPluginEnabled(id)` hook - Check if specific plugin is enabled
- Plugin components are conditionally rendered based on isEnabled state

**Available Plugins:**
- `code-generator` - Generates Matomo tracking code snippets for WEB, iOS, Android platforms
- `analytics-chart` - Displays event analytics chart for the last 30 days from Matomo
- `platform-statuses` - Platform implementation and validation status management with history
- `comments` - Event discussion and commenting system

**Plugin Management UI:**
- Accessible at `/plugins` (admin-only page)
- Toggle switch to enable/disable plugins
- Shows plugin version and description

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connected via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database queries and schema management
- **connect-pg-simple**: Session storage (available but not currently used for auth)

### UI Framework
- **Radix UI**: Accessible primitive components (dialogs, dropdowns, tabs, etc.)
- **shadcn/ui**: Pre-styled component library using Radix primitives
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **class-variance-authority**: Component variant management
- **Recharts**: Data visualization charts

### Build & Development
- **Vite**: Frontend bundler with HMR
- **esbuild**: Server bundling for production
- **TypeScript**: Full type checking across client and server
- **Tailwind CSS**: Utility-first CSS framework

### Validation
- **Zod**: Schema validation used throughout for form validation and API contracts
- **drizzle-zod**: Generates Zod schemas from Drizzle table definitions