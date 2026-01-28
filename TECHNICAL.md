# Техническая документация

## Содержание

1. [Стек технологий](#стек-технологий)
2. [Архитектура приложения](#архитектура-приложения)
3. [База данных](#база-данных)
4. [Система аутентификации](#система-аутентификации)
5. [Система авторизации (роли)](#система-авторизации-роли)
6. [Система плагинов](#система-плагинов)
7. [Кэширование](#кэширование)
8. [Безопасность](#безопасность)
9. [API](#api)

---

## Стек технологий

### Frontend

| Технология | Назначение |
|------------|------------|
| **React 18** | Основной UI-фреймворк |
| **TypeScript** | Типизация |
| **Wouter** | Легковесный роутинг (альтернатива React Router) |
| **TanStack React Query** | Управление серверным состоянием и кэширование запросов |
| **shadcn/ui** | Библиотека UI-компонентов на базе Radix UI |
| **Tailwind CSS** | Утилитарный CSS-фреймворк |
| **react-hook-form** | Управление формами |
| **Zod** | Валидация данных |
| **Recharts** | Графики и визуализация данных |
| **Lucide React** | Библиотека иконок |
| **Vite** | Сборщик с поддержкой HMR |

### Backend

| Технология | Назначение |
|------------|------------|
| **Express.js 5** | HTTP-сервер и API |
| **TypeScript** | Типизация |
| **Drizzle ORM** | ORM для работы с PostgreSQL |
| **PostgreSQL** | База данных |
| **bcrypt** | Хэширование паролей |
| **express-session** | Управление сессиями |
| **connect-pg-simple** | Хранение сессий в PostgreSQL |
| **Zod** | Валидация входных данных API |

### Инструменты разработки

| Инструмент | Назначение |
|------------|------------|
| **esbuild** | Сборка сервера для production |
| **drizzle-kit** | Миграции базы данных |
| **tsx** | Запуск TypeScript на сервере |

---

## Архитектура приложения

### Структура проекта

```
├── client/                 # Frontend-приложение
│   └── src/
│       ├── components/     # UI-компоненты (shadcn/ui)
│       ├── hooks/          # React-хуки для работы с данными
│       ├── pages/          # Страницы приложения
│       ├── plugins/        # Модули-плагины
│       └── lib/            # Утилиты и конфигурация
│
├── server/                 # Backend-приложение
│   ├── index.ts            # Точка входа сервера
│   ├── routes.ts           # API-маршруты
│   ├── storage.ts          # Слой работы с БД
│   ├── db.ts               # Подключение к БД
│   └── analyticsCache.ts   # Кэширование аналитики
│
├── shared/                 # Общий код
│   ├── schema.ts           # Схема БД и типы
│   └── routes.ts           # Определения API-маршрутов
│
└── migrations/             # Миграции Drizzle
```

### Принципы архитектуры

1. **Монорепо** — frontend и backend в одном репозитории с общими типами
2. **Type-safe API** — маршруты и типы определены в `shared/routes.ts`, используются на обоих концах
3. **Слой абстракции БД** — все операции с БД проходят через `storage.ts`
4. **Модульность** — функциональность расширяется через систему плагинов

---

## База данных

### Диаграмма связей (ER)

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│     events      │────<│  event_platform_     │────<│   status_history    │
│                 │     │     statuses         │     │                     │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
        │                        │
        │                        │
        ▼                        │
┌─────────────────┐              │
│  event_versions │◄─────────────┘
│   (snapshots)   │
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     users       │     │ property_       │     │    plugins      │
│                 │     │ templates       │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    comments     │────>│     events      │
│                 │     │   (event_id)    │
└─────────────────┘     └─────────────────┘

┌─────────────────┐
│    session      │  (автоматически создается connect-pg-simple)
└─────────────────┘
```

### Описание таблиц

#### `events` — Основная таблица событий

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `category` | TEXT | Категория события (обязательно) |
| `block` | TEXT | Блок на странице |
| `action` | TEXT | Действие события (обязательно) |
| `action_description` | TEXT | Описание действия |
| `name` | TEXT | Имя события |
| `value_description` | TEXT | Описание значения |
| `owner` | TEXT | Ответственный |
| `platforms` | TEXT[] | Массив платформ: web, ios, android, backend |
| `platform_jira_links` | JSONB | Ссылки на Jira по платформам |
| `platform_statuses` | JSONB | Legacy: статусы по платформам |
| `implementation_status` | TEXT | Legacy: глобальный статус внедрения |
| `validation_status` | TEXT | Legacy: глобальный статус валидации |
| `properties` | JSONB | Массив свойств события |
| `notes` | TEXT | Заметки |
| `current_version` | INTEGER | Текущая версия события |
| `created_at` | TIMESTAMP | Дата создания |
| `updated_at` | TIMESTAMP | Дата обновления |

#### `event_versions` — Версии событий (снимки)

Хранит полный снимок состояния события на момент каждой версии.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `event_id` | INTEGER | Ссылка на событие |
| `version` | INTEGER | Номер версии (v1, v2...) |
| `category, action, ...` | — | Снимок всех полей события |
| `change_description` | TEXT | Описание изменений в этой версии |
| `created_by` | TEXT | Кто создал версию |
| `created_at` | TIMESTAMP | Дата создания версии |

**Связь:** `event_versions.event_id → events.id` (многие к одному)

#### `event_platform_statuses` — Статусы платформ по версиям

Независимые статусы для каждой платформы в каждой версии события.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `event_id` | INTEGER | Ссылка на событие |
| `version_number` | INTEGER | Номер версии |
| `platform` | TEXT | Платформа: web, ios, android, backend |
| `jira_link` | TEXT | Ссылка на задачу в Jira |
| `implementation_status` | TEXT | Статус внедрения |
| `validation_status` | TEXT | Статус валидации |
| `created_at` | TIMESTAMP | Дата создания |
| `updated_at` | TIMESTAMP | Дата обновления |

**Связь:** `event_platform_statuses.event_id → events.id`

#### `status_history` — История изменения статусов

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `event_platform_status_id` | INTEGER | Ссылка на статус платформы |
| `status_type` | TEXT | Тип: implementation или validation |
| `old_status` | TEXT | Предыдущий статус |
| `new_status` | TEXT | Новый статус |
| `changed_by` | TEXT | Кто изменил |
| `created_at` | TIMESTAMP | Дата изменения |

**Связь:** `status_history.event_platform_status_id → event_platform_statuses.id`

#### `users` — Пользователи

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `email` | TEXT UNIQUE | Email (логин) |
| `name` | TEXT | Имя пользователя |
| `password_hash` | TEXT | Хэш пароля (bcrypt) |
| `role` | TEXT | Роль: viewer, developer, analyst, admin |
| `is_active` | BOOLEAN | Активен ли аккаунт |
| `created_at` | TIMESTAMP | Дата создания |
| `updated_at` | TIMESTAMP | Дата обновления |

#### `property_templates` — Шаблоны свойств

Глобальная библиотека переиспользуемых свойств.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `dimension` | INTEGER UNIQUE | Номер dimension в Matomo |
| `name` | TEXT | Название свойства |
| `description` | TEXT | Описание |
| `example_data` | TEXT | Примеры значений |
| `storage_format` | TEXT | Тип данных |
| `category` | TEXT | Категория свойства |
| `created_at` | TIMESTAMP | Дата создания |
| `updated_at` | TIMESTAMP | Дата обновления |

#### `comments` — Комментарии к событиям

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Уникальный идентификатор |
| `event_id` | INTEGER | Ссылка на событие |
| `content` | TEXT | Текст комментария |
| `author` | TEXT | Автор |
| `created_at` | TIMESTAMP | Дата создания |

**Связь:** `comments.event_id → events.id`

#### `plugins` — Плагины системы

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | ID плагина (code-generator и т.д.) |
| `name` | TEXT | Название |
| `description` | TEXT | Описание |
| `version` | TEXT | Версия |
| `is_enabled` | BOOLEAN | Включен ли |
| `config` | JSONB | Конфигурация плагина |
| `installed_at` | TIMESTAMP | Дата установки |
| `updated_at` | TIMESTAMP | Дата обновления |

#### `session` — Сессии пользователей

Таблица автоматически создается библиотекой `connect-pg-simple`.

| Поле | Тип | Описание |
|------|-----|----------|
| `sid` | VARCHAR PK | ID сессии |
| `sess` | JSON | Данные сессии |
| `expire` | TIMESTAMP | Время истечения |

### Enum-значения

**Статусы внедрения (implementation_status):**
- `черновик` — событие в разработке
- `в_разработке` — в процессе внедрения
- `внедрено` — полностью внедрено
- `архив` — устаревшее событие

**Статусы валидации (validation_status):**
- `ожидает_проверки` — не проверено
- `корректно` — данные корректны
- `ошибка` — обнаружена ошибка
- `предупреждение` — есть замечания

**Платформы:**
- `web`, `ios`, `android`, `backend`

**Роли пользователей:**
- `viewer`, `developer`, `analyst`, `admin`

---

## Система аутентификации

### Обзор

Приложение использует **session-based authentication** с хранением сессий в PostgreSQL.

### Компоненты

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│   Browser   │─────>│  Express.js     │─────>│  PostgreSQL  │
│  (Cookie)   │<─────│  (express-      │<─────│  (session    │
│             │      │   session)      │      │   table)     │
└─────────────┘      └─────────────────┘      └──────────────┘
```

### Конфигурация сессий

```typescript
// server/index.ts
app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",  // HTTPS only в prod
      httpOnly: true,                                  // Недоступно из JS
      maxAge: 30 * 24 * 60 * 60 * 1000,               // 30 дней
      sameSite: "lax",                                 // CSRF-защита
    },
  })
);
```

### Хэширование паролей

Используется **bcrypt** с 10 раундами:

```typescript
// Создание хэша
const passwordHash = await bcrypt.hash(password, 10);

// Проверка пароля
const isValid = await bcrypt.compare(password, user.passwordHash);
```

### API аутентификации

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/auth/login` | POST | Вход в систему |
| `/api/auth/logout` | POST | Выход из системы |
| `/api/auth/me` | GET | Получить текущего пользователя |
| `/api/setup/status` | GET | Проверка настройки системы |
| `/api/setup` | POST | Первоначальная настройка (создание админа) |

### Процесс входа

1. Пользователь отправляет email и пароль на `/api/auth/login`
2. Сервер находит пользователя по email
3. Сравнивает пароль с хэшем через bcrypt
4. При успехе создает сессию и сохраняет `userId` в `req.session`
5. Возвращает данные пользователя (без хэша пароля)
6. Cookie с session ID устанавливается в браузере

### Первоначальная настройка

При первом запуске (нет пользователей):
1. Система перенаправляет на `/setup`
2. Создается первый администратор
3. Администратор автоматически входит в систему
4. Страница `/setup` становится недоступной

### Frontend-защита маршрутов

```typescript
// client/src/App.tsx
function ProtectedRoute({ component: Component }) {
  const { isAuthenticated, isLoading } = useIsAuthenticated();
  const { data: setupStatus } = useSetupStatus();

  if (!setupStatus?.isConfigured) {
    return <Redirect to="/setup" />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}
```

---

## Система авторизации (роли)

### Иерархия ролей

| Роль | Описание | Права |
|------|----------|-------|
| **viewer** | Только просмотр | Просмотр событий и свойств |
| **developer** | Разработчик | + изменение статусов платформ |
| **analyst** | Аналитик | + создание/редактирование событий и свойств |
| **admin** | Администратор | + управление пользователями и плагинами |

### Матрица прав

```typescript
// shared/schema.ts
export const ROLE_PERMISSIONS = {
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
    canChangeStatuses: true,  // Может менять статусы
    canManageUsers: false,
    canManageProperties: false
  },
  analyst: {
    canViewEvents: true,
    canCreateEvents: true,   // Может создавать события
    canEditEvents: true,     // Может редактировать
    canDeleteEvents: false,
    canChangeStatuses: true,
    canManageUsers: false,
    canManageProperties: true  // Может управлять свойствами
  },
  admin: {
    canViewEvents: true,
    canCreateEvents: true,
    canEditEvents: true,
    canDeleteEvents: true,   // Может удалять
    canChangeStatuses: true,
    canManageUsers: true,    // Может управлять пользователями
    canManageProperties: true
  }
};
```

### Проверка прав на сервере

```typescript
// Пример проверки прав администратора
app.patch("/api/plugins/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Доступ запрещен" });
  }
  
  // ... выполнение операции
});
```

### Frontend-хук для проверки прав

```typescript
// client/src/hooks/useAuth.ts
export function useCurrentUser() {
  return useQuery<UserWithoutPassword | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: Infinity,
  });
}
```

---

## Система плагинов

### Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    База данных                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ plugins: id, name, isEnabled, config (JSONB)    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ API
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Сервер                               │
│  • GET /api/plugins — список плагинов                   │
│  • PATCH /api/plugins/:id — включение/настройка         │
│  • Seed при старте — создание дефолтных плагинов        │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ HTTP
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Frontend                             │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │ usePlugins()     │  │ useIsPlugin      │             │
│  │ — загрузка       │  │ Enabled(id)      │             │
│  │   всех плагинов  │  │ — проверка       │             │
│  └──────────────────┘  └──────────────────┘             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ client/src/plugins/                              │    │
│  │  ├── code-generator/                             │    │
│  │  │   ├── index.tsx      (React-компонент)        │    │
│  │  │   ├── manifest.json  (метаданные)             │    │
│  │  │   └── README.md      (документация)           │    │
│  │  ├── analytics-chart/                            │    │
│  │  ├── platform-statuses/                          │    │
│  │  └── comments/                                   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Структура плагина

Каждый плагин — папка в `client/src/plugins/<plugin-id>/`:

```
analytics-chart/
├── index.tsx       # React-компонент плагина
├── manifest.json   # Метаданные: name, description, version
└── README.md       # Документация
```

### Регистрация плагина

```typescript
// client/src/plugins/analytics-chart/index.tsx
export const pluginInfo = {
  id: "analytics-chart",
  name: "График аналитики",
  component: AnalyticsChart,
};

export default AnalyticsChart;
```

### Инициализация плагинов (seed)

При старте сервера создаются записи для всех плагинов:

```typescript
// server/routes.ts
async function seedPlugins() {
  const existingPlugins = await storage.getPlugins();
  const existingIds = existingPlugins.map(p => p.id);

  if (!existingIds.includes("analytics-chart")) {
    await storage.upsertPlugin({
      id: "analytics-chart",
      name: "График аналитики",
      description: "Отображает график событий за последние 30 дней",
      version: "1.0.0",
      isEnabled: true,
      config: {
        apiUrl: "",
        apiToken: "",
        platformSiteMapping: {}
      },
    });
  }
  // ... другие плагины
}
```

### Использование плагинов

```typescript
// Проверка включен ли плагин
const { data: isEnabled } = useIsPluginEnabled("analytics-chart");

// Условный рендеринг
{isEnabled && <AnalyticsChart event={event} />}
```

### Доступные плагины

| ID | Название | Описание |
|----|----------|----------|
| `code-generator` | Генератор кода Matomo | Генерирует код отправки событий для WEB, iOS, Android |
| `analytics-chart` | График аналитики | График событий за 30 дней из Matomo API |
| `platform-statuses` | Статусы платформ | Управление статусами внедрения и валидации |
| `comments` | Комментарии | Обсуждение событий |

### Конфигурация плагинов

Плагины могут иметь настройки, хранящиеся в поле `config` (JSONB):

```typescript
// Пример конфигурации analytics-chart
{
  apiUrl: "https://analytics.example.com/index.php",
  apiToken: "abc123...",
  platformSiteMapping: {
    web: "1",
    ios: "2",
    android: "3"
  }
}
```

---

## Кэширование

### Кэш аналитики

Для снижения нагрузки на Matomo API реализовано серверное кэширование:

```typescript
// server/analyticsCache.ts
class AnalyticsCache {
  private cache: Map<string, CacheEntry> = new Map();
  
  // TTL = 12 часов
  private CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  generateKey(label, platform, startDate, endDate): string {
    return `${label}:${platform}:${startDate}:${endDate}`;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Проверка срока жизни
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### API управления кэшем (только для админов)

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/analytics/cache-stats` | GET | Статистика кэша |
| `/api/analytics/clear-cache` | POST | Очистка кэша |

### TanStack Query кэширование

Frontend использует React Query для кэширования API-запросов:

```typescript
// Настройка staleTime
const { data } = useQuery({
  queryKey: ["/api/events"],
  staleTime: 5 * 60 * 1000,  // 5 минут
});

// Инвалидация кэша после мутации
queryClient.invalidateQueries({ queryKey: ["/api/events"] });
```

---

## Безопасность

### Защита паролей

- **bcrypt** с 10 раундами соли
- Пароли никогда не передаются в ответах API
- Минимальная длина пароля при создании

### Защита сессий

| Параметр | Значение | Назначение |
|----------|----------|------------|
| `httpOnly` | true | Cookie недоступны из JavaScript |
| `secure` | true (prod) | Только HTTPS в production |
| `sameSite` | "lax" | Защита от CSRF |
| `maxAge` | 30 дней | Автоматическое истечение |

### Защита от брутфорс-атак

- Для чувствительных маршрутов аутентификации используется rate limiting по IP.
- Лимиты:
  - `/api/auth/login`: до 10 попыток за 10 минут, блокировка на 15 минут.
  - `/api/setup`: до 5 попыток за 30 минут, блокировка на 60 минут.
- При превышении лимитов возвращается `429 Too Many Requests`.
- Попытки и блокировки логируются (уровень `warn`) с указанием IP, метода и пути.

### Переменные окружения

```bash
# Обязательные в production
DATABASE_URL=postgresql://...    # Подключение к БД
SESSION_SECRET=<random-64-bytes> # Секрет для подписи сессий

# Генерация SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Валидация входных данных

Все входные данные валидируются через Zod:

```typescript
// shared/routes.ts
export const api = {
  events: {
    create: {
      path: "/api/events",
      input: insertEventSchema,  // Zod-схема
      output: z.object({...}),
    }
  }
};

// server/routes.ts
app.post("/api/events", async (req, res) => {
  const result = insertEventSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues });
  }
  // ... безопасные данные в result.data
});
```

### Защита API-маршрутов

```typescript
// Проверка аутентификации
if (!req.session.userId) {
  return res.status(401).json({ message: "Unauthorized" });
}

// Проверка роли
const user = await storage.getUser(req.session.userId);
if (user.role !== "admin") {
  return res.status(403).json({ message: "Доступ запрещен" });
}
```

### SQL-инъекции

Drizzle ORM автоматически параметризует все запросы:

```typescript
// Безопасно — параметризованный запрос
const user = await db
  .select()
  .from(users)
  .where(eq(users.email, email))  // email экранируется
  .limit(1);
```

---

## API

### Основные endpoints

#### События

| Endpoint | Метод | Роль | Описание |
|----------|-------|------|----------|
| `/api/events` | GET | все | Список событий |
| `/api/events/:id` | GET | все | Детали события |
| `/api/events` | POST | analyst+ | Создание события |
| `/api/events/:id` | PATCH | analyst+ | Обновление события |
| `/api/events/:id` | DELETE | admin | Удаление события |

#### Версии событий

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/events/:id/versions` | GET | Список версий |
| `/api/events/:id/versions/:version` | GET | Конкретная версия |

#### Статусы платформ

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/events/:id/platform-statuses` | GET | Статусы всех платформ |
| `/api/events/:id/platform-statuses` | PATCH | Обновление статуса |
| `/api/events/:id/platform-statuses/:platform/history` | GET | История статусов |

#### Пользователи

| Endpoint | Метод | Роль | Описание |
|----------|-------|------|----------|
| `/api/users` | GET | admin | Список пользователей |
| `/api/users/:id` | GET | admin | Детали пользователя |
| `/api/users` | POST | admin | Создание пользователя |
| `/api/users/:id` | PATCH | admin | Обновление пользователя |
| `/api/users/:id` | DELETE | admin | Удаление пользователя |

#### Плагины

| Endpoint | Метод | Роль | Описание |
|----------|-------|------|----------|
| `/api/plugins` | GET | все | Список плагинов |
| `/api/plugins/:id` | GET | все | Детали плагина |
| `/api/plugins/:id` | PATCH | admin | Вкл/выкл и настройка |

### Формат ответов

**Успех:**
```json
{
  "id": 1,
  "category": "page_view",
  ...
}
```

**Ошибка:**
```json
{
  "message": "Событие не найдено"
}
```

**Ошибка валидации:**
```json
{
  "errors": [
    {
      "path": ["email"],
      "message": "Invalid email"
    }
  ]
}
```

---

## Дополнительные материалы

- `INSTALL.md` — инструкция по установке и развёртыванию
- `replit.md` — обзор проекта и архитектуры
- `client/src/plugins/*/README.md` — документация плагинов
