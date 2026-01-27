import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Database, Loader2 } from "lucide-react";
import { PROPERTY_CATEGORIES, PROPERTY_TYPES, ROLE_PERMISSIONS, type PropertyTemplate } from "@shared/schema";
import { useCurrentUser } from "@/hooks/use-current-user";

function PropertyForm({ 
  initialData, 
  onSuccess, 
  mode 
}: { 
  initialData?: PropertyTemplate; 
  onSuccess: () => void; 
  mode: "create" | "edit" 
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: nextDimension } = useQuery({
    queryKey: ["/api/property-templates/next-dimension"],
    queryFn: async () => {
      const res = await fetch("/api/property-templates/next-dimension");
      return res.json();
    },
    enabled: mode === "create"
  });

  const [formData, setFormData] = useState({
    dimension: initialData?.dimension || nextDimension?.nextDimension || 1,
    name: initialData?.name || "",
    description: initialData?.description || "",
    exampleData: initialData?.exampleData || "",
    storageFormat: initialData?.storageFormat || "текст",
    category: initialData?.category || "другое"
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = mode === "create" 
        ? "/api/property-templates" 
        : `/api/property-templates/${initialData?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to save template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-templates"] });
      toast({
        title: mode === "create" ? "Свойство создано" : "Свойство обновлено",
        description: "Изменения успешно сохранены."
      });
      onSuccess();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось сохранить свойство."
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...formData,
      dimension: Number(formData.dimension)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dimension *</Label>
          <Input 
            type="number" 
            value={formData.dimension}
            onChange={(e) => setFormData({ ...formData, dimension: Number(e.target.value) })}
            required
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label>Категория</Label>
          <Select 
            value={formData.category} 
            onValueChange={(v) => setFormData({ ...formData, category: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Название *</Label>
        <Input 
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="например, User Type"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Описание</Label>
        <Textarea 
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Описание свойства..."
          className="resize-none h-20"
        />
      </div>

      <div className="space-y-2">
        <Label>Пример данных</Label>
        <Input 
          value={formData.exampleData || ""}
          onChange={(e) => setFormData({ ...formData, exampleData: e.target.value })}
          placeholder="Guest, Super_Guest, Host, Admin"
        />
      </div>

      <div className="space-y-2">
        <Label>Формат хранения</Label>
        <Select 
          value={formData.storageFormat} 
          onValueChange={(v) => setFormData({ ...formData, storageFormat: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPERTY_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === "create" ? "Создать" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}

export default function PropertiesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PropertyTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  // Check user permissions
  const { data: currentUser } = useCurrentUser();
  const userPermissions = currentUser ? ROLE_PERMISSIONS[currentUser.role] : null;
  const canManageProperties = userPermissions?.canManageProperties ?? false;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/property-templates", categoryFilter],
    queryFn: async () => {
      const url = categoryFilter === "all" 
        ? "/api/property-templates" 
        : `/api/property-templates?category=${categoryFilter}`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/property-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-templates"] });
      toast({
        title: "Свойство удалено",
        description: "Свойство успешно удалено из библиотеки."
      });
      setDeleteId(null);
    }
  });

  const handleEdit = (template: PropertyTemplate) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const groupedTemplates = templates.reduce((acc: Record<string, PropertyTemplate[]>, template: PropertyTemplate) => {
    const cat = template.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-muted/5">
      <Sidebar />
      <main className="flex-1 md:ml-64 p-6 lg:p-10 space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Database className="w-8 h-8 text-primary" />
              Библиотека свойств
            </h1>
            <p className="text-muted-foreground mt-1">
              Управление глобальными свойствами событий. Используйте их для быстрого добавления к событиям.
            </p>
          </div>
          {canManageProperties && (
            <Button onClick={handleCreate} className="shadow-md">
              <Plus className="w-4 h-4 mr-2" />
              Новое свойство
            </Button>
          )}
        </div>

        <div className="flex gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px] border-none bg-muted/50">
              <SelectValue placeholder="Все категории" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              {PROPERTY_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : categoryFilter === "all" ? (
          Object.entries(groupedTemplates).map(([category, items]) => (
            <div key={category} className="space-y-4">
              <h2 className="text-xl font-semibold capitalize">{category}</h2>
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-[100px]">Dimension</TableHead>
                      <TableHead>Описание</TableHead>
                      <TableHead>Пример данных</TableHead>
                      <TableHead>Формат хранения</TableHead>
                      {canManageProperties && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items as PropertyTemplate[]).map((template) => (
                      <TableRow key={template.id} className="group hover:bg-muted/30">
                        <TableCell className="font-mono font-bold text-primary">
                          {template.dimension}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{template.name}</span>
                            {template.description && (
                              <span className="text-xs text-muted-foreground">{template.description}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground font-mono">
                            {template.exampleData || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{template.storageFormat}</Badge>
                        </TableCell>
                        {canManageProperties && (
                          <TableCell>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => handleEdit(template)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(template.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[100px]">Dimension</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead>Пример данных</TableHead>
                  <TableHead>Формат хранения</TableHead>
                  {canManageProperties && <TableHead className="w-[100px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageProperties ? 5 : 4} className="h-32 text-center text-muted-foreground">
                      Нет свойств в этой категории
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((template: PropertyTemplate) => (
                    <TableRow key={template.id} className="group hover:bg-muted/30">
                      <TableCell className="font-mono font-bold text-primary">
                        {template.dimension}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{template.name}</span>
                          {template.description && (
                            <span className="text-xs text-muted-foreground">{template.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground font-mono">
                          {template.exampleData || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{template.storageFormat}</Badge>
                      </TableCell>
                      {canManageProperties && (
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleEdit(template)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(template.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Редактировать свойство" : "Новое свойство"}
              </DialogTitle>
            </DialogHeader>
            <PropertyForm 
              mode={editingTemplate ? "edit" : "create"}
              initialData={editingTemplate || undefined}
              onSuccess={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить свойство?</AlertDialogTitle>
              <AlertDialogDescription>
                Это действие нельзя отменить. Свойство будет удалено из библиотеки.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive hover:bg-destructive/90"
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
