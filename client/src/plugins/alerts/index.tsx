import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, Trash2, Loader2, Bell, RefreshCw, TrendingDown, ExternalLink, Settings, Save } from "lucide-react";
import { Link } from "wouter";
import type { EventAlert } from "@shared/schema";

export const PLATFORM_LABELS: Record<string, string> = {
  web: "WEB",
  ios: "iOS",
  android: "Android",
  backend: "Backend"
};

export const PLATFORM_COLORS: Record<string, string> = {
  web: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  ios: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  android: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  backend: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
};

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return "";
}

export interface CheckProgress {
  isRunning: boolean;
  completed: number;
  total: number;
  alertsFound: number;
}

export function useAlertCheck() {
  const { toast } = useToast();
  const [checkProgress, setCheckProgress] = useState<CheckProgress | null>(null);

  const startCheck = async () => {
    if (checkProgress?.isRunning) return;
    
    setCheckProgress({ isRunning: true, completed: 0, total: 0, alertsFound: 0 });
    
    try {
      const eventSource = new EventSource("/api/alerts/check-stream");
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          eventSource.close();
          setCheckProgress(null);
          toast({
            title: "Ошибка",
            description: data.error,
            variant: "destructive",
          });
          return;
        }
        
        if (data.status === "started") {
          setCheckProgress({
            isRunning: true,
            completed: 0,
            total: data.total,
            alertsFound: 0,
          });
        } else if (data.status === "progress") {
          setCheckProgress({
            isRunning: true,
            completed: data.completed,
            total: data.total,
            alertsFound: data.alertsFound || 0,
          });
        } else if (data.status === "completed") {
          eventSource.close();
          setCheckProgress(null);
          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
          toast({
            title: "Проверка завершена",
            description: `Проверено: ${data.total} проверок. Создано алертов: ${data.alertsCreated}.`,
          });
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        setCheckProgress(null);
        toast({
          title: "Ошибка",
          description: "Соединение прервано",
          variant: "destructive",
        });
      };
    } catch (error: any) {
      setCheckProgress(null);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось выполнить проверку",
        variant: "destructive",
      });
    }
  };

  return { checkProgress, startCheck };
}

export interface AlertSettings {
  id?: number;
  matomoUrl: string;
  matomoToken: string;
  matomoSiteId: string;
  dropThreshold: number;
  maxConcurrency: number;
  isEnabled: boolean;
  updatedAt?: string;
}

export const alertSettingsSchema = z.object({
  matomoUrl: z.string().min(1, "URL обязателен"),
  matomoToken: z.string().min(1, "Токен обязателен"),
  matomoSiteId: z.string().min(1, "ID сайтов обязательны"),
  dropThreshold: z.number().min(1).max(100),
  maxConcurrency: z.number().min(1).max(20),
  isEnabled: z.boolean(),
});

export type AlertSettingsForm = z.infer<typeof alertSettingsSchema>;

export function useAlertSettings() {
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useQuery<AlertSettings>({
    queryKey: ["/api/alerts/settings"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AlertSettingsForm) => {
      const response = await apiRequest("PUT", "/api/alerts/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/settings"] });
      toast({
        title: "Настройки сохранены",
        description: "Конфигурация модуля алертов обновлена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить настройки",
        variant: "destructive",
      });
    },
  });

  return { settings, isLoading, saveMutation };
}

export function useAlerts() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: alertsData, isLoading, refetch } = useQuery<{ alerts: EventAlert[]; total: number }>({
    queryKey: ["/api/alerts"]
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Алерт удален" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить алерт",
        variant: "destructive",
      });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/alerts/bulk-delete", { ids });
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: `Удалено алертов: ${ids.length}` });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить алерты",
        variant: "destructive",
      });
    }
  });

  return {
    alerts: alertsData?.alerts || [],
    total: alertsData?.total || 0,
    isLoading,
    refetch,
    deleteMutation,
    bulkDeleteMutation
  };
}

interface AlertCheckProgressProps {
  progress: CheckProgress;
}

export function AlertCheckProgress({ progress }: AlertCheckProgressProps) {
  if (!progress.isRunning || progress.total === 0) return null;
  
  return (
    <div className="border rounded-lg p-4 bg-muted/50" data-testid="check-progress">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Проверка событий...</span>
        <span className="text-sm text-muted-foreground">
          {progress.completed} / {progress.total}
        </span>
      </div>
      <Progress 
        value={(progress.completed / progress.total) * 100} 
        className="h-2"
      />
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>Найдено алертов: {progress.alertsFound}</span>
        <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
      </div>
    </div>
  );
}

interface AlertRowProps {
  alert: EventAlert;
  isSelected: boolean;
  onSelect: (id: number, selected: boolean) => void;
  onDelete: (alert: EventAlert) => void;
  onViewEvent: (eventId: number) => void;
  canDelete: boolean;
}

export function AlertRow({ alert, isSelected, onSelect, onDelete, onViewEvent, canDelete }: AlertRowProps) {
  return (
    <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
      {canDelete && (
        <TableCell className="w-12">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(alert.id, !!checked)}
            data-testid={`checkbox-alert-${alert.id}`}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onViewEvent(alert.eventId)}
            className="text-left font-medium hover:text-primary hover:underline flex items-center gap-1"
            data-testid={`link-event-${alert.id}`}
          >
            {alert.eventCategory}
            <ExternalLink className="h-3 w-3" />
          </button>
          <span className="text-sm text-muted-foreground font-mono">
            @{alert.eventAction}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge className={PLATFORM_COLORS[alert.platform] || "bg-gray-100"}>
          {PLATFORM_LABELS[alert.platform] || alert.platform}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-destructive font-medium">
          <TrendingDown className="h-4 w-4" />
          -{alert.dropPercent}%
        </div>
      </TableCell>
      <TableCell className="text-right">{alert.dayBeforeCount.toLocaleString()}</TableCell>
      <TableCell className="text-right text-destructive font-medium">
        {alert.yesterdayCount.toLocaleString()}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm">{formatDateTime(alert.checkedAt)}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.checkedAt)}</span>
        </div>
      </TableCell>
      {canDelete && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(alert)}
            data-testid={`button-delete-alert-${alert.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

export default {
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  formatDateTime,
  formatRelativeTime,
  useAlertCheck,
  useAlertSettings,
  useAlerts,
  AlertCheckProgress,
  AlertRow,
  alertSettingsSchema
};
