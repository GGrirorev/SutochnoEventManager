# Event Monitoring & Alerts

Независимый модуль мониторинга событий аналитики для Sutochno.ru.

## Описание

Модуль отслеживает падение количества событий аналитики между вчерашним и позавчерашним днём. При обнаружении значительного снижения (по умолчанию 30% и более) создаётся алерт.

## Настройки

Доступ к настройкам: `/alerts/settings` (только для администраторов)

### Параметры конфигурации

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `matomoUrl` | URL API Matomo | `https://analytics.sutochno.ru/index.php` |
| `matomoToken` | Токен авторизации API | Переменная `ANALYTICS_API_TOKEN` |
| `matomoSiteId` | Соответствие платформ и ID сайтов | `web:1,ios:2,android:3` |
| `dropThreshold` | Порог падения в процентах | `30` |
| `maxConcurrency` | Параллельных запросов к API | `5` |
| `isEnabled` | Модуль включен | `true` |

### Формат matomoSiteId

Строка через запятую: `платформа:id`

Пример: `web:1,ios:2,android:3`

## API Endpoints

### Для авторизованных пользователей

- `GET /api/alerts` — Список всех алертов
- `GET /api/alerts/check-stream` — SSE-поток прогресса проверки

### Для admin и analyst

- `DELETE /api/alerts/:id` — Удаление алерта
- `POST /api/alerts/bulk-delete` — Массовое удаление

### Только для admin

- `GET /api/alerts/settings` — Получить настройки
- `PUT /api/alerts/settings` — Обновить настройки

### Для cron-заданий (без авторизации)

- `POST /api/alerts/check` — Запуск проверки

## Автоматическая проверка (Cron)

Для ежедневной автоматической проверки настройте внешнее cron-задание:

**URL для вызова:**
```
POST https://your-domain.replit.app/api/alerts/check
```

**Рекомендуемое расписание:** ежедневно после 23:00 (чтобы данные за вчерашний день были полными)

**Примеры сервисов:**
- [cron-job.org](https://cron-job.org) — Создайте задание с методом POST
- [EasyCron](https://easycron.com) — Расписание `0 23 * * *`
- [UptimeRobot](https://uptimerobot.com) — HTTP(s) Keyword монитор

**Ответ API:**
```json
{
  "message": "Проверка завершена. Создано алертов: 2.",
  "alertsCreated": 2,
  "eventsChecked": 15
}
```

## База данных

### Таблица event_alerts

Хранит информацию об алертах:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial | Первичный ключ |
| `eventId` | integer | ID события |
| `platform` | text | Платформа (web, ios, android) |
| `eventCategory` | text | Категория события |
| `eventAction` | text | Action события |
| `yesterdayCount` | integer | Количество вчера |
| `dayBeforeCount` | integer | Количество позавчера |
| `dropPercent` | integer | Процент падения |
| `checkedAt` | timestamp | Дата проверки |
| `isResolved` | boolean | Решено |

### Таблица alert_settings

Хранит конфигурацию модуля:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | serial | Первичный ключ |
| `matomoUrl` | text | URL API |
| `matomoToken` | text | Токен |
| `matomoSiteId` | text | ID сайтов |
| `dropThreshold` | integer | Порог падения |
| `maxConcurrency` | integer | Параллелизм |
| `isEnabled` | boolean | Включен |
| `updatedAt` | timestamp | Дата обновления |

## Исключение событий из мониторинга

События можно исключить из мониторинга через флаг `excludeFromMonitoring` в таблице `events`. Это полезно для:
- Сезонных событий
- Тестовых событий
- Событий с нестабильным трафиком

## Особенности

1. **Ограничение параллелизма** — Запросы к API выполняются пакетами для предотвращения перегрузки
2. **Прогресс в реальном времени** — SSE-поток показывает статус проверки
3. **Фильтрация** — Алерты можно фильтровать по категории и платформе
4. **Массовые операции** — Поддержка выбора и удаления нескольких алертов
