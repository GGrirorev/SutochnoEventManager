import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink, Calendar, ArrowRight, Rocket, ShieldCheck, MessageSquare, Link2, Edit2 } from "lucide-react";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS } from "@shared/schema";

interface PlatformStatusesProps {
  eventId: number;
  platforms: string[];
  displayVersion: number;
  canChangeStatuses?: boolean;
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
  changedByUserName?: string;
  comment?: string;
  jiraLink?: string;
}

function formatStatus(status: string | undefined): string {
  if (!status) return "-";
  const formatted = status.replace(/_/g, ' ');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
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

interface StatusEditorProps {
  platform: string;
  statusType: 'implementation' | 'validation';
  currentStatus: string;
  statusOptions: readonly string[];
  onUpdate: (newStatus: string, comment?: string, jiraLink?: string) => void;
  isPending: boolean;
  testIdPrefix: string;
}

function StatusEditor({ 
  platform, 
  statusType, 
  currentStatus, 
  statusOptions, 
  onUpdate, 
  isPending,
  testIdPrefix 
}: StatusEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [comment, setComment] = useState("");
  const [jiraLink, setJiraLink] = useState("");

  const handleOpen = () => {
    setSelectedStatus(currentStatus);
    setComment("");
    setJiraLink("");
    setIsOpen(true);
  };

  const handleSave = () => {
    onUpdate(selectedStatus, comment || undefined, jiraLink || undefined);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-7 text-xs justify-between w-full font-normal"
          onClick={handleOpen}
          disabled={isPending}
          data-testid={`${testIdPrefix}-${platform}`}
        >
          <span className={getStatusColor(currentStatus)}>
            {formatStatus(currentStatus)}
          </span>
          <Edit2 className="w-3 h-3 ml-2 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {statusType === 'implementation' ? 'Статус внедрения' : 'Статус валидации'}
            </Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-${testIdPrefix}-${platform}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {formatStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`comment-${platform}-${statusType}`} className="text-xs">
              Комментарий
            </Label>
            <Textarea
              id={`comment-${platform}-${statusType}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Опишите причину изменения..."
              className="resize-none text-xs"
              rows={2}
              data-testid={`input-comment-${platform}-${statusType}`}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`jira-${platform}-${statusType}`} className="text-xs">
              Ссылка на Jira
            </Label>
            <Input
              id={`jira-${platform}-${statusType}`}
              value={jiraLink}
              onChange={(e) => setJiraLink(e.target.value)}
              placeholder="https://jira.example.com/TASK-123"
              className="h-8 text-xs"
              data-testid={`input-jira-${platform}-${statusType}`}
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCancel}
              className="flex-1"
              data-testid={`button-cancel-${platform}-${statusType}`}
            >
              Отмена
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={isPending}
              className="flex-1"
              data-testid={`button-save-${platform}-${statusType}`}
            >
              {isPending ? "..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PlatformStatuses({ 
  eventId, 
  platforms, 
  displayVersion,
  canChangeStatuses = true
}: PlatformStatusesProps) {
  const queryClient = useQueryClient();

  const { data: platformStatuses = [] } = useQuery<PlatformStatus[]>({
    queryKey: ["/api/events", eventId, "platform-statuses", displayVersion],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses?version=${displayVersion}`, {
        credentials: 'include'
      });
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
      versionNumber,
      statusComment,
      statusJiraLink
    }: { 
      platform: string; 
      implementationStatus?: string; 
      validationStatus?: string;
      versionNumber: number;
      statusComment?: string;
      statusJiraLink?: string;
    }) => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ implementationStatus, validationStatus, versionNumber, statusComment, statusJiraLink }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "platform-statuses", displayVersion] });
    },
  });

  const handleImplementationUpdate = (platform: string, newStatus: string, comment?: string, jiraLink?: string) => {
    updateStatusMutation.mutate({
      platform,
      implementationStatus: newStatus,
      versionNumber: displayVersion,
      statusComment: comment,
      statusJiraLink: jiraLink
    });
  };

  const handleValidationUpdate = (platform: string, newStatus: string, comment?: string, jiraLink?: string) => {
    updateStatusMutation.mutate({
      platform,
      validationStatus: newStatus,
      versionNumber: displayVersion,
      statusComment: comment,
      statusJiraLink: jiraLink
    });
  };

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
                    <span className="text-xs text-muted-foreground mb-1 block">Внедрение:</span>
                    {canChangeStatuses ? (
                      <StatusEditor
                        platform={p}
                        statusType="implementation"
                        currentStatus={ps.implementationStatus || "черновик"}
                        statusOptions={IMPLEMENTATION_STATUS}
                        onUpdate={(status, comment, jira) => handleImplementationUpdate(p, status, comment, jira)}
                        isPending={updateStatusMutation.isPending}
                        testIdPrefix="btn-implementation"
                      />
                    ) : (
                      <span className={`text-sm font-medium ${getStatusColor(ps.implementationStatus)}`}>
                        {formatStatus(ps.implementationStatus || "черновик")}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground mb-1 block">Валидация:</span>
                    {canChangeStatuses ? (
                      <StatusEditor
                        platform={p}
                        statusType="validation"
                        currentStatus={ps.validationStatus || "ожидает_проверки"}
                        statusOptions={VALIDATION_STATUS}
                        onUpdate={(status, comment, jira) => handleValidationUpdate(p, status, comment, jira)}
                        isPending={updateStatusMutation.isPending}
                        testIdPrefix="btn-validation"
                      />
                    ) : (
                      <span className={`text-sm font-medium ${getStatusColor(ps.validationStatus)}`}>
                        {formatStatus(ps.validationStatus || "ожидает_проверки")}
                      </span>
                    )}
                  </div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    История изменений ({ps.history?.length || 0})
                  </summary>
                  <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                    {ps.history && ps.history.length > 0 ? (
                      ps.history.slice().reverse().map((h: StatusHistoryEntry, i: number) => (
                        <div key={`hist-${i}`} className="py-1.5 border-b border-muted/50 last:border-b-0">
                          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                            {h.statusType === 'implementation' ? (
                              <Rocket className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            )}
                            <span className="font-medium text-foreground">
                              {h.statusType === 'implementation' ? 'Внедрение:' : 'Валидация:'}
                            </span>
                            <span className={getStatusColor(h.oldStatus)}>
                              {formatStatus(h.oldStatus)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className={getStatusColor(h.newStatus)}>
                              {formatStatus(h.newStatus)}
                            </span>
                            <span className="ml-auto flex items-center gap-2 opacity-70 whitespace-nowrap">
                              {h.changedByUserName && (
                                <span className="text-foreground/80">{h.changedByUserName}</span>
                              )}
                              {h.createdAt ? new Date(h.createdAt).toLocaleDateString('ru-RU') : ''}
                            </span>
                          </div>
                          {(h.comment || h.jiraLink) && (
                            <div className="mt-1 pl-5 space-y-1">
                              {h.comment && (
                                <div className="flex items-start gap-1.5 text-muted-foreground">
                                  <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span className="text-foreground/80">{h.comment}</span>
                                </div>
                              )}
                              {h.jiraLink && (
                                <div className="flex items-center gap-1.5">
                                  <Link2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                                  <a 
                                    href={h.jiraLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                                  >
                                    {h.jiraLink}
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground py-2">Нет записей об изменениях статусов</p>
                    )}
                  </div>
                </details>
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
