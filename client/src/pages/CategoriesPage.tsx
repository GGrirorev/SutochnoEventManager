import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar, useSidebar } from "@/components/Sidebar";
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
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Folder, Loader2 } from "lucide-react";
import { ROLE_PERMISSIONS, type EventCategory } from "@shared/schema";
import { useCurrentUser } from "@/hooks/useAuth";

function CategoryForm({ 
  initialData, 
  onSuccess, 
  mode 
}: { 
  initialData?: EventCategory; 
  onSuccess: () => void; 
  mode: "create" | "edit" 
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || ""
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = mode === "create" 
        ? "/api/categories" 
        : `/api/categories/${initialData?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save category");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: mode === "create" ? "Категория создана" : "Категория обновлена",
        description: "Изменения успешно сохранены."
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось сохранить категорию."
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Название категории обязательно."
      });
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Название категории *</Label>
        <Input
          id="name"
          data-testid="input-category-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Например: Авторизация"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Описание</Label>
        <Textarea
          id="description"
          data-testid="input-category-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Краткое описание категории событий"
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button 
          type="submit" 
          data-testid="button-save-category"
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "create" ? "Создать" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}

export default function CategoriesPage() {
  const { isCollapsed } = useSidebar();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);

  const userRole = currentUser?.role || "viewer";
  const permissions = ROLE_PERMISSIONS[userRole];
  const canCreate = permissions.canCreateEvents;
  const canEdit = permissions.canEditEvents;
  const canDelete = permissions.canDeleteEvents;

  const { data: categories, isLoading, error } = useQuery<EventCategory[]>({
    queryKey: ["/api/categories"]
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete category");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Категория удалена",
        description: "Категория успешно удалена."
      });
      setDeleteDialogOpen(false);
      setSelectedCategory(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось удалить категорию."
      });
    }
  });

  const handleEdit = (category: EventCategory) => {
    setSelectedCategory(category);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (category: EventCategory) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedCategory) {
      deleteMutation.mutate(selectedCategory.id);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 p-6 transition-all duration-300 ${isCollapsed ? "ml-16" : "ml-64"}`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Категории событий</h1>
              <p className="text-muted-foreground">
                Управление категориями для группировки событий аналитики
              </p>
            </div>
            {canCreate && (
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-category">
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить категорию
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Новая категория</DialogTitle>
                  </DialogHeader>
                  <CategoryForm 
                    mode="create" 
                    onSuccess={() => setCreateDialogOpen(false)} 
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Список категорий ({categories?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-destructive">
                  Ошибка загрузки категорий
                </div>
              ) : categories && categories.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Название</TableHead>
                      <TableHead>Описание</TableHead>
                      {(canEdit || canDelete) && (
                        <TableHead className="w-[100px] text-right">Действия</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {category.description || "—"}
                        </TableCell>
                        {(canEdit || canDelete) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-edit-category-${category.id}`}
                                  onClick={() => handleEdit(category)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-category-${category.id}`}
                                  onClick={() => handleDeleteClick(category)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Категории не найдены. Создайте первую категорию.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактирование категории</DialogTitle>
          </DialogHeader>
          {selectedCategory && (
            <CategoryForm 
              mode="edit" 
              initialData={selectedCategory}
              onSuccess={() => {
                setEditDialogOpen(false);
                setSelectedCategory(null);
              }} 
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить категорию?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить категорию "{selectedCategory?.name}"? 
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-category"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
