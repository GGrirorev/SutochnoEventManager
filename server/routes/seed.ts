import { storage } from "../storage";

export async function seedPlugins() {
  const existingPlugins = await storage.getPlugins();
  const existingIds = existingPlugins.map((p) => p.id);

  if (!existingIds.includes("code-generator")) {
    await storage.upsertPlugin({
      id: "code-generator",
      name: "Генератор кода Matomo",
      description:
        "Генерирует примеры кода для отправки событий в Matomo для разных платформ (Web, iOS, Android)",
      version: "1.0.0",
      isEnabled: true,
      config: { showForPlatforms: ["web", "ios", "android"] },
    });
  }

  if (!existingIds.includes("analytics-chart")) {
    await storage.upsertPlugin({
      id: "analytics-chart",
      name: "График аналитики",
      description:
        "Отображает график событий за последние 30 дней с данными из системы аналитики Matomo",
      version: "1.0.0",
      isEnabled: true,
      config: { period: 30 },
    });
  }

  if (!existingIds.includes("platform-statuses")) {
    await storage.upsertPlugin({
      id: "platform-statuses",
      name: "Статусы платформ",
      description:
        "Управление статусами внедрения и валидации для каждой платформы с полной историей изменений",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }

  if (!existingIds.includes("comments")) {
    await storage.upsertPlugin({
      id: "comments",
      name: "Комментарии",
      description: "Система комментариев для обсуждения событий аналитики",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }

  if (!existingIds.includes("csv-import")) {
    await storage.upsertPlugin({
      id: "csv-import",
      name: "Импорт из CSV",
      description: "Массовый импорт событий из CSV файла",
      version: "1.0.0",
      isEnabled: true,
      config: {},
    });
  }
}

export async function seedDatabase() {
  const existing = await storage.getEvents();
  if (existing.events.length > 0) return;

  const sampleEvents = [
    {
      categoryName: "Авторизация",
      action: "finish_signup",
      actionDescription: "Пользователь успешно завершил процесс регистрации, заполнив все поля",
      name: "signup_completed",
      valueDescription: "Количество успешных регистраций",
      platforms: ["все"],
      implementationStatus: "внедрено" as const,
      validationStatus: "корректно" as const,
      owner: "Команда Авторизации",
      properties: [
        { name: "userId", type: "string", required: true, description: "Уникальный идентификатор пользователя" },
        { name: "method", type: "string", required: true, description: "email, google или apple" },
        { name: "platform", type: "string", required: true, description: "web, ios или android" },
      ],
    },
    {
      categoryName: "E-commerce",
      action: "click_checkout",
      actionDescription: "Нажатие на кнопку оформления заказа в корзине",
      name: "checkout_started",
      valueDescription: "Предварительная стоимость корзины",
      platforms: ["web", "ios", "android"],
      implementationStatus: "в_разработке" as const,
      validationStatus: "ожидает_проверки" as const,
      owner: "Команда Оформления",
      properties: [
        { name: "cartValue", type: "number", required: true, description: "Общая стоимость корзины" },
        { name: "itemCount", type: "number", required: true, description: "Количество товаров" },
      ],
    },
    {
      categoryName: "Стабильность",
      action: "crash",
      actionDescription: "Автоматическое событие при возникновении критического исключения",
      name: "app_crashed",
      valueDescription: "Код ошибки",
      platforms: ["ios", "android"],
      implementationStatus: "внедрено" as const,
      validationStatus: "ошибка" as const,
      owner: "Платформенная команда",
      notes: "В данный момент отсутствует свойство stack trace в продакшене",
      properties: [
        { name: "screen", type: "string", required: true, description: "Экран, где произошло падение" },
        { name: "version", type: "string", required: true, description: "Версия приложения" },
      ],
    },
  ];

  for (const event of sampleEvents) {
    const { categoryName, ...eventData } = event;
    await storage.createEvent({
      ...eventData,
      category: categoryName,
    });
  }
}
