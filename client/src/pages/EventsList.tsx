import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useEvents, useDeleteEvent } from "@/hooks/use-events";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { EventForm } from "@/components/EventForm";
import { 
  Search, 
  MoreHorizontal, 
  Filter, 
  Plus, 
  Smartphone, 
  Globe, 
  Server,
  Code
} from "lucide-react";
import { format } from "date-fns";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS, PLATFORMS, type Event } from "@shared/schema";

export default function EventsList() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  
  // Sheet state for creating/editing
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: events, isLoading } = useEvents({ 
    search, 
    platform: platform === "all" ? undefined : platform,
    status: status === "all" ? undefined : status 
  });
  
  const deleteMutation = useDeleteEvent();

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setEditingEvent(null);
    setSheetOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const getPlatformIcon = (p: string) => {
    switch (p) {
      case 'web': return <Globe className="w-3.5 h-3.5" />;
      case 'ios': 
      case 'android': return <Smartphone className="w-3.5 h-3.5" />;
      case 'backend': return <Server className="w-3.5 h-3.5" />;
      default: return <Code className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-muted/5">
      <Sidebar />
      <main className="flex-1 md:ml-64 p-6 lg:p-10 space-y-6">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Схема событий</h1>
            <p className="text-muted-foreground mt-1">Управление определениями аналитических событий продукта.</p>
          </div>
          <Button onClick={handleCreate} className="shadow-md hover:shadow-lg transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Новое событие
          </Button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Поиск по названию или категории..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-none bg-muted/50 focus-visible:ring-1"
            />
          </div>
          
          <div className="flex gap-3">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[180px] border-none bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                   <Smartphone className="w-4 h-4" />
                   <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все платформы</SelectItem>
                {PLATFORMS.map(p => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px] border-none bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                   <Filter className="w-4 h-4" />
                   <SelectValue placeholder="Статус" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {IMPLEMENTATION_STATUS.map(s => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Event Category</TableHead>
                <TableHead>Event Action</TableHead>
                <TableHead className="w-[200px]">Event Name</TableHead>
                <TableHead>Event Value</TableHead>
                <TableHead>Платформа</TableHead>
                <TableHead>Внедрение</TableHead>
                <TableHead>Валидация</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading Skeleton
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : events?.length === 0 ? (
                // Empty State
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="p-4 rounded-full bg-muted mb-3">
                        <Filter className="w-6 h-6" />
                      </div>
                      <p className="font-medium">События не найдены</p>
                      <p className="text-sm mt-1">Попробуйте изменить фильтры или создать новое событие.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Data
                events?.map((event) => (
                  <TableRow key={event.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {event.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{event.action}</span>
                        {event.actionDescription && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 line-clamp-2 italic">
                            {event.actionDescription}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 opacity-70">
                        <span className="font-mono text-xs text-muted-foreground">{event.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-mono">{event.value ?? 0}</span>
                        {event.valueDescription && (
                          <span className="text-[10px] text-muted-foreground italic">
                            ({event.valueDescription})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal capitalize gap-1 pl-1.5">
                        {getPlatformIcon(event.platform)}
                        {event.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.implementationStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.validationStatus} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Действия</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleEdit(event)}>Редактировать</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(event, null, 2))}>
                            Копировать JSON
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(event.id)}
                          >
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-xl w-full flex flex-col h-full">
            <SheetHeader className="mb-6">
              <SheetTitle>{editingEvent ? "Редактировать событие" : "Создать новое событие"}</SheetTitle>
              <SheetDescription>
                Определите схему и свойства вашего аналитического события.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-hidden -mx-6 px-6">
              <EventForm 
                mode={editingEvent ? "edit" : "create"}
                initialData={editingEvent || undefined}
                onSuccess={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Вы абсолютно уверены?</AlertDialogTitle>
              <AlertDialogDescription>
                Это действие нельзя отменить. Это навсегда удалит определение события
                из вашего плана отслеживания.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
                Удалить событие
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
