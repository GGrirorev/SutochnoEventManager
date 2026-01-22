import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { insertEventSchema, IMPLEMENTATION_STATUS, PLATFORMS, VALIDATION_STATUS, type InsertEvent, type PropertyTemplate } from "@shared/schema";
import { useCreateEvent, useUpdateEvent } from "@/hooks/use-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Loader2, Library } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EventFormProps {
  initialData?: InsertEvent & { id?: number };
  onSuccess?: () => void;
  mode: "create" | "edit";
}

const storageFormatToType: Record<string, string> = {
  "текст": "string",
  "целое_число": "number",
  "дробное_число": "number",
  "дата_и_время": "string",
  "булево": "boolean",
  "массив": "array",
  "объект": "object"
};

export function EventForm({ initialData, onSuccess, mode }: EventFormProps) {
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();

  const { data: propertyTemplates = [] } = useQuery<PropertyTemplate[]>({
    queryKey: ["/api/property-templates"],
    queryFn: async () => {
      const res = await fetch("/api/property-templates");
      return res.json();
    }
  });
  
  const form = useForm<InsertEvent>({
    resolver: zodResolver(insertEventSchema),
    defaultValues: initialData || {
      category: "",
      action: "",
      actionDescription: "",
      name: "",
      valueDescription: "",
      platforms: ["все"],
      implementationStatus: "черновик",
      validationStatus: "ожидает_проверки",
      owner: "",
      notes: "",
      properties: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "properties" as never, // Typings for dynamic jsonb are tricky with Zod
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (data: InsertEvent) => {
    if (mode === "edit" && initialData?.id) {
      await updateMutation.mutateAsync({ id: initialData.id, ...data });
    } else {
      await createMutation.mutateAsync(data);
    }
    onSuccess?.();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 h-full flex flex-col">
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          <div className="space-y-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Category *</FormLabel>
                    <FormControl>
                      <Input placeholder="например, Авторизация" {...field} />
                    </FormControl>
                    <FormDescription>Верхнеуровневая категория событий.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="action"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Action *</FormLabel>
                    <FormControl>
                      <Input placeholder="например, click" {...field} />
                    </FormControl>
                    <FormDescription>Основное действие конкретного события.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="actionDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-blue-600 dark:text-blue-400">Описание действия *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Что триггерит это действие?" 
                      className="resize-none h-20 border-blue-200 focus-visible:ring-blue-500"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Event Name (Вторичное)</FormLabel>
                    <FormControl>
                      <Input placeholder="например, checkout_completed" className="font-mono text-sm bg-muted/30" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Дополнительный контекст к действию.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valueDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Value (Описание)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="например, Сумма оплаты или ID товара" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>Описание передаваемого значения события.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="platforms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Платформы</FormLabel>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {PLATFORMS.map((p) => (
                        <div key={p} className="flex items-center space-x-2 bg-muted/50 px-3 py-2 rounded-md">
                          <Checkbox
                            id={`platform-${p}`}
                            checked={field.value?.includes(p)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) {
                                field.onChange([...current, p]);
                              } else {
                                field.onChange(current.filter((v: string) => v !== p));
                              }
                            }}
                          />
                          <label
                            htmlFor={`platform-${p}`}
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 uppercase"
                          >
                            {p}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ответственный</FormLabel>
                    <FormControl>
                      <Input placeholder="Команда или человек" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
              <FormField
                control={form.control}
                name="implementationStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Внедрение</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Статус" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {IMPLEMENTATION_STATUS.map(s => (
                          <SelectItem key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validationStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Валидация</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Статус" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VALIDATION_STATUS.map(s => (
                          <SelectItem key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Properties Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <FormLabel className="text-base font-semibold">Свойства события</FormLabel>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8">
                        <Library className="w-4 h-4 mr-2" />
                        Из библиотеки
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                      <DropdownMenuLabel>Выберите свойство</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {propertyTemplates.length === 0 ? (
                        <DropdownMenuItem disabled>Библиотека пуста</DropdownMenuItem>
                      ) : (
                        propertyTemplates.map((template) => (
                          <DropdownMenuItem
                            key={template.id}
                            onClick={() => append({
                              name: template.name,
                              type: storageFormatToType[template.storageFormat] || "string",
                              required: true,
                              description: template.description || ""
                            })}
                            className="flex flex-col items-start"
                          >
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs text-muted-foreground">
                              D{template.dimension} • {template.storageFormat}
                            </span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => append({ name: "", type: "string", required: true, description: "" })}
                    className="h-8"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Новое
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="h-[200px] rounded-md border p-4 bg-muted/10">
                {fields.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Свойства не определены. Нажмите добавить, чтобы определить схему.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-start p-3 bg-card rounded-md border shadow-sm group relative">
                        <div className="col-span-4">
                          <Input 
                            {...form.register(`properties.${index}.name` as const)} 
                            placeholder="название_свойства" 
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-3">
                          <Select 
                            onValueChange={(val) => form.setValue(`properties.${index}.type` as any, val)}
                            defaultValue={field.type}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Тип" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="object">Object</SelectItem>
                              <SelectItem value="array">Array</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4">
                          <Input 
                            {...form.register(`properties.${index}.description` as const)} 
                            placeholder="Описание..." 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center pt-2">
                           <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="col-span-12 flex items-center gap-2 mt-2">
                          <Switch 
                             checked={form.watch(`properties.${index}.required` as any)}
                             onCheckedChange={(checked) => form.setValue(`properties.${index}.required` as any, checked)}
                          />
                          <span className="text-xs text-muted-foreground">Обязательно</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Технические заметки</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Любые детали реализации или особенности..." 
                      className="resize-none h-20 font-mono text-xs"
                      {...field}
                      value={field.value || ""} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="pt-4 border-t flex justify-end gap-3 sticky bottom-0 bg-background py-2">
          <Button type="submit" disabled={isPending} className="w-48">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "create" ? "Создать событие" : "Сохранить изменения"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
