import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEventVersions } from "@/hooks/use-events";
import { usePlugins } from "@/hooks/usePlugins";
import { useCurrentUser } from "@/hooks/useAuth";
import { ROLE_PERMISSIONS } from "@shared/schema";
import { getPluginsForSlot, type EventDetailsPluginContext } from "@/plugins/registry";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText,
  Activity,
  Copy,
  Check,
  History,
  ChevronDown,
  Pencil
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

function CopyableText({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  
  return (
    <span className={`inline-flex items-center gap-1 group/copy ${className}`}>
      <span>{text}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover/copy:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
        data-testid={`button-copy-${text.replace(/\s+/g, '-').toLowerCase()}`}
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
    </span>
  );
}

export function EventDetailsModal({ event: initialEvent, onEdit }: { event: any; onEdit?: (event: any) => void }) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const { data: plugins = [] } = usePlugins();
  
  const { data: currentUser } = useCurrentUser();
  const userPermissions = currentUser ? ROLE_PERMISSIONS[currentUser.role] : null;
  const canChangeStatuses = userPermissions?.canChangeStatuses ?? false;
  const canComment = userPermissions?.canComment ?? false;
  const canEditEvents = userPermissions?.canEditEvents ?? false;
  const isAdmin = currentUser?.role === 'admin';

  const { data: event = initialEvent } = useQuery({
    queryKey: ["/api/events", initialEvent.id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${initialEvent.id}`);
      return res.json();
    }
  });

  const displayVersion = selectedVersion || event.currentVersion || 1;

  const { data: versions = [] } = useEventVersions(event.id);
  
  const currentVersionNumber = selectedVersion || event.currentVersion || 1;
  const currentVersionData = versions.find((v: any) => v.version === (event.currentVersion || 1));
  const displayedVersion = selectedVersion 
    ? versions.find((v: any) => v.version === selectedVersion) 
    : currentVersionData;
  
  const displayData = displayedVersion || event;

  const enabledPluginIds = new Set(
    plugins.filter((plugin) => plugin.isEnabled).map((plugin) => plugin.id)
  );

  const pluginContext: EventDetailsPluginContext = {
    event: {
      ...displayData,
      id: event.id,
      category: displayData.category ?? event.category,
      action: displayData.action ?? event.action,
      platforms: displayData.platforms ?? event.platforms,
    },
    displayVersion,
    canChangeStatuses,
    canComment,
    isAdmin,
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return "text-muted-foreground";
    const normalized = status.toLowerCase().replace(/ /g, '_');
    switch (normalized) {
      case 'внедрено':
      case 'корректно':
        return "text-emerald-600 dark:text-emerald-400 font-medium";
      case 'в_разработке':
      case 'предупреждение':
        return "text-amber-600 dark:text-amber-400 font-medium";
      case 'черновик':
        return "text-blue-600 dark:text-blue-400 font-medium";
      case 'ошибка':
        return "text-rose-600 dark:text-rose-400 font-medium";
      case 'архив':
      case 'ожидает_проверки':
      default:
        return "text-slate-600 dark:text-slate-400";
    }
  };

  const renderPluginSlot = (slot: Parameters<typeof getPluginsForSlot>[0]) =>
    getPluginsForSlot(slot)
      .filter((plugin) => enabledPluginIds.has(plugin.id))
      .map((plugin) => {
        const renderer = plugin.renderers[slot];
        if (!renderer) return null;
        return <div key={plugin.id}>{renderer(pluginContext)}</div>;
      });

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="text-2xl flex items-center gap-3">
            <Badge variant="outline" className="text-base font-normal">
              {displayData.category}
            </Badge>
            {displayData.action}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {canEditEvents && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-edit-event"
                title="Редактировать событие"
                onClick={() => onEdit(event)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">
              v{event.currentVersion || 1}
            </Badge>
            
            {versions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1">
                    <History className="w-3 h-3" />
                    {selectedVersion ? `v${selectedVersion}` : 'История'}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Версии</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setSelectedVersion(null)}
                    className={!selectedVersion ? "bg-accent" : ""}
                  >
                    Текущая (v{event.currentVersion || 1})
                  </DropdownMenuItem>
                  {versions.filter((v: any) => v.version !== (event.currentVersion || 1)).map((v: any) => (
                    <DropdownMenuItem 
                      key={v.version}
                      onClick={() => setSelectedVersion(v.version)}
                      className={selectedVersion === v.version ? "bg-accent" : ""}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {v.createdAt && format(new Date(v.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {v.changeDescription || `Версия ${v.version}`}
                        </span>
                        {v.authorName && (
                          <span className="text-[10px] text-muted-foreground/70">
                            Автор: {v.authorName}
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {selectedVersion && displayedVersion && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-700 dark:text-amber-300">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Просмотр версии v{selectedVersion}</span>
              {displayedVersion.createdAt && (
                <span className="text-xs opacity-80">
                  от {format(new Date(displayedVersion.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                </span>
              )}
              {displayedVersion.authorName && (
                <span className="text-xs opacity-80">
                  • Автор: {displayedVersion.authorName}
                </span>
              )}
              {event.ownerName && (
                <span className="text-xs opacity-80">
                  • Ответственный: {event.ownerName}{event.ownerDepartment ? ` (${event.ownerDepartment})` : ''}
                </span>
              )}
              <button className="underline ml-auto" onClick={() => setSelectedVersion(null)}>Вернуться к текущей</button>
            </div>
            {displayedVersion.changeDescription && displayedVersion.version > 1 && (
              <div className="text-xs opacity-80 mt-1">
                Изменения: {displayedVersion.changeDescription}
              </div>
            )}
          </div>
        )}
        {!selectedVersion && currentVersionData && (
          <div className="mt-2 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Текущая версия v{event.currentVersion || 1}</span>
              {currentVersionData.createdAt && (
                <span className="text-xs opacity-80">
                  от {format(new Date(currentVersionData.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                </span>
              )}
              {currentVersionData.authorName && (
                <span className="text-xs opacity-80">
                  • Автор: {currentVersionData.authorName}
                </span>
              )}
              {event.ownerName && (
                <span className="text-xs opacity-80">
                  • Ответственный: {event.ownerName}{event.ownerDepartment ? ` (${event.ownerDepartment})` : ''}
                </span>
              )}
            </div>
            {currentVersionData.changeDescription && currentVersionData.version > 1 && (
              <div className="text-xs opacity-70 mt-1">
                Изменения: {currentVersionData.changeDescription}
              </div>
            )}
          </div>
        )}
      </DialogHeader>

      <Tabs defaultValue="description" className="pt-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="description" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Описание
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Здоровье
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="space-y-6 pt-4">
          <div className="space-y-4">
            {displayData.block && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Блок</h4>
                <p className="text-sm">{displayData.block}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Описание действия</h4>
              <p className="text-sm">
                {displayData.actionDescription || "Нет описания"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Event Category</h4>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  <CopyableText text={displayData.category || "-"} />
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Event Action</h4>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  <CopyableText text={displayData.action || "-"} />
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Event Name</h4>
                <p className="text-sm font-mono bg-muted p-2 rounded">{displayData.name || "-"}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Значение (Value)</h4>
                <p className="text-sm bg-muted p-2 rounded">{displayData.valueDescription || "-"}</p>
              </div>
            </div>
          </div>

          {displayData.properties && displayData.properties.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Свойства (Properties)</h4>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="h-8 text-xs">Название</TableHead>
                      <TableHead className="h-8 text-xs">Тип</TableHead>
                      <TableHead className="h-8 text-xs">Описание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.properties.map((prop: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="py-2 text-xs font-mono">{prop.name}</TableCell>
                        <TableCell className="py-2 text-xs">{prop.type}</TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{prop.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {displayData.notes && (
            <div>
              <h4 className="text-sm font-semibold mb-1 text-muted-foreground">Заметки</h4>
              <p className="text-xs font-mono bg-muted/50 p-3 rounded border">{displayData.notes}</p>
            </div>
          )}

          {renderPluginSlot("event-details-details")}
        </TabsContent>

        <TabsContent value="health" className="space-y-6 pt-4">
          {renderPluginSlot("event-details-health")}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}
