import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Bell, Code, MessageSquare, TrendingUp, Upload } from "lucide-react";
import { MatomoCodeGenerator } from "@/plugins/code-generator";
import { AnalyticsChart } from "@/plugins/analytics-chart";
import { PlatformStatuses } from "@/plugins/platform-statuses";
import Comments from "@/plugins/comments";
import { CsvImportButton } from "@/plugins/csv-import";

export type PluginSlot =
  | "event-details-details"
  | "event-details-health"
  | "events-list-header-actions";

export interface EventDetailsPluginContext {
  event: {
    id: number;
    category: string;
    action: string;
    platforms?: string[];
  };
  displayVersion: number;
  canChangeStatuses: boolean;
  canComment: boolean;
  isAdmin: boolean;
}

export interface EventsListPluginContext {
  canCreate: boolean;
}

export type PluginRenderers = Partial<Record<PluginSlot, (context: any) => ReactNode>>;

export interface PluginRegistryEntry {
  id: string;
  name: string;
  icon?: LucideIcon;
  renderers: PluginRenderers;
}

export const pluginRegistry: PluginRegistryEntry[] = [
  {
    id: "code-generator",
    name: "Генератор кода Matomo",
    icon: Code,
    renderers: {
      "event-details-details": ({ event }: EventDetailsPluginContext) => (
        <MatomoCodeGenerator event={event} />
      ),
    },
  },
  {
    id: "analytics-chart",
    name: "График аналитики",
    icon: TrendingUp,
    renderers: {
      "event-details-health": ({ event }: EventDetailsPluginContext) => (
        <AnalyticsChart
          eventAction={event.action}
          eventCategory={event.category}
          platforms={event.platforms || []}
        />
      ),
    },
  },
  {
    id: "platform-statuses",
    name: "Статусы платформ",
    icon: Activity,
    renderers: {
      "event-details-health": ({
        event,
        displayVersion,
        canChangeStatuses,
      }: EventDetailsPluginContext) => (
        <PlatformStatuses
          eventId={event.id}
          platforms={event.platforms || []}
          displayVersion={displayVersion}
          canChangeStatuses={canChangeStatuses}
        />
      ),
    },
  },
  {
    id: "comments",
    name: "Комментарии",
    icon: MessageSquare,
    renderers: {
      "event-details-details": ({ event, canComment, isAdmin }: EventDetailsPluginContext) => (
        <Comments eventId={event.id} canComment={canComment} isAdmin={isAdmin} />
      ),
    },
  },
  {
    id: "csv-import",
    name: "Импорт из CSV",
    icon: Upload,
    renderers: {
      "events-list-header-actions": ({ canCreate }: EventsListPluginContext) =>
        canCreate ? <CsvImportButton /> : null,
    },
  },
  {
    id: "alerts",
    name: "Алерты",
    icon: Bell,
    renderers: {},
  },
];

export function getPluginEntry(id: string) {
  return pluginRegistry.find((plugin) => plugin.id === id);
}

export function getPluginsForSlot(slot: PluginSlot) {
  return pluginRegistry.filter((plugin) => Boolean(plugin.renderers[slot]));
}
