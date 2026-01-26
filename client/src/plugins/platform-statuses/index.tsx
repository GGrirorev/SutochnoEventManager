import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Calendar, ArrowRight, Rocket, ShieldCheck } from "lucide-react";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS } from "@shared/schema";

interface PlatformStatusesProps {
  eventId: number;
  platforms: string[];
  displayVersion: number;
}

interface PlatformStatus {
  platform: string;
  implementationStatus: string;
  validationStatus: string;
  jiraLink?: string;
  history?: StatusHistoryEntry[];
}

interface StatusHistoryEntry {
  statusType: 'implementation' | 'validation';
  oldStatus: string;
  newStatus: string;
  createdAt: string;
}

function getStatusColor(status: string | undefined): string {
  if (!status) return "text-muted-foreground";
  
  const colors: Record<string, string> = {
    "черновик": "text-gray-500",
    "в_разработке": "text-blue-500",
    "внедрено": "text-green-500",
    "архив": "text-gray-400",
    "ожидает_проверки": "text-yellow-500",
    "корректно": "text-green-500",
    "ошибка": "text-red-500",
    "предупреждение": "text-orange-500",
  };
  
  return colors[status] || "text-muted-foreground";
}

export function PlatformStatuses({ 
  eventId, 
  platforms, 
  displayVersion
}: PlatformStatusesProps) {
  const queryClient = useQueryClient();

  const { data: platformStatuses = [] } = useQuery<PlatformStatus[]>({
    queryKey: ["/api/events", eventId, "platform-statuses", displayVersion],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses?version=${displayVersion}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!eventId && displayVersion > 0,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      platform, 
      implementationStatus, 
      validationStatus,
      versionNumber 
    }: { 
      platform: string; 
      implementationStatus?: string; 
      validationStatus?: string;
      versionNumber: number;
    }) => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ implementationStatus, validationStatus, versionNumber }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "platform-statuses", displayVersion] });
    },
  });

  const statusData = platformStatuses.length > 0 
    ? platformStatuses 
    : platforms.map((p: string) => ({
        platform: p,
        implementationStatus: "черновик",
        validationStatus: "ожидает_проверки"
      }));

  return (
    <div data-testid="plugin-platform-statuses">
      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Платформы и статусы</h4>
      <div className="space-y-3">
        {statusData.map((ps: PlatformStatus) => {
          const p = ps.platform;
          const jiraLink = ps.jiraLink;
          return (
            <div key={p} className="p-3 bg-muted/30 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="secondary" className="uppercase text-[10px]">
                  {p}
                </Badge>
                {jiraLink && (
                  <a
                    href={jiraLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Jira
                  </a>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground">Внедрение:</span>
                    <div className="mt-1">
                      <Select
                        value={ps.implementationStatus || "черновик"}
                        onValueChange={(value) => 
                          updateStatusMutation.mutate({ 
                            platform: p, 
                            implementationStatus: value,
                            versionNumber: displayVersion
                          })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-implementation-${p}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IMPLEMENTATION_STATUS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs" data-testid={`option-impl-${s}-${p}`}>
                              {s.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground">Валидация:</span>
                    <div className="mt-1">
                      <Select
                        value={ps.validationStatus || "ожидает_проверки"}
                        onValueChange={(value) => 
                          updateStatusMutation.mutate({ 
                            platform: p, 
                            validationStatus: value,
                            versionNumber: displayVersion
                          })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-validation-${p}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALIDATION_STATUS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs" data-testid={`option-valid-${s}-${p}`}>
                              {s.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {ps.history && ps.history.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      История изменений ({ps.history.length})
                    </summary>
                    <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                      {ps.history.slice().reverse().map((h: StatusHistoryEntry, i: number) => (
                        <div key={`hist-${i}`} className="flex items-center gap-2 text-muted-foreground py-1">
                          {h.statusType === 'implementation' ? (
                            <Rocket className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          )}
                          <span className="font-medium text-foreground">
                            {h.statusType === 'implementation' ? 'Внедрение:' : 'Валидация:'}
                          </span>
                          <span className={getStatusColor(h.oldStatus)}>
                            {h.oldStatus?.replace(/_/g, ' ') || '-'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className={getStatusColor(h.newStatus)}>
                            {h.newStatus?.replace(/_/g, ' ')}
                          </span>
                          <span className="ml-auto opacity-70 whitespace-nowrap">
                            {h.createdAt ? new Date(h.createdAt).toLocaleDateString('ru-RU') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const pluginInfo = {
  id: "platform-statuses",
  name: "Статусы платформ",
  component: PlatformStatuses,
};

export default PlatformStatuses;
