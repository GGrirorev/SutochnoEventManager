import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ParsedEvent {
  platforms: string[];
  block: string;
  actionDescription: string;
  category: string;
  action: string;
  name: string;
  valueDescription: string;
  properties: { name: string; type: string; required: boolean; description: string }[];
}

interface ImportPreview {
  newEvents: ParsedEvent[];
  existingEvents: { parsed: ParsedEvent; existingId: number; existingVersion: number }[];
  errors: string[];
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function CsvImportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("skip");
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parseCsv = useCallback((content: string): ParsedEvent[] => {
    const lines = content.split("\n").filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(";").map(h => h.trim());
    const events: ParsedEvent[] = [];

    const platformIndex = headers.findIndex(h => h.toLowerCase().includes("платформа"));
    const blockIndex = headers.findIndex(h => h.toLowerCase() === "блок");
    const actionDescIndex = headers.findIndex(h => h.toLowerCase() === "действие");
    const categoryIndex = headers.findIndex(h => h.toLowerCase().includes("event category"));
    const actionIndex = headers.findIndex(h => h.toLowerCase().includes("event action"));
    const nameIndex = headers.findIndex(h => h.toLowerCase().includes("event name"));
    const valueIndex = headers.findIndex(h => h.toLowerCase().includes("event value"));

    const dimensionIndices: { index: number; name: string }[] = [];
    headers.forEach((h, i) => {
      if (h.toLowerCase().startsWith("dimension")) {
        dimensionIndices.push({ index: i, name: h });
      }
    });

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(";").map(v => v.trim().replace(/^"|"$/g, ""));
      
      if (!values[categoryIndex] || !values[actionIndex]) continue;

      const platformsRaw = values[platformIndex] || "";
      const platforms: string[] = [];
      if (platformsRaw.toLowerCase().includes("web")) platforms.push("web");
      if (platformsRaw.toLowerCase().includes("ios")) platforms.push("ios");
      if (platformsRaw.toLowerCase().includes("android")) platforms.push("android");
      if (platformsRaw.toLowerCase().includes("backend")) platforms.push("backend");

      const properties: { name: string; type: string; required: boolean; description: string }[] = [];
      
      if (values[valueIndex]) {
        properties.push({
          name: "eventValue",
          type: "string",
          required: false,
          description: values[valueIndex]
        });
      }

      dimensionIndices.forEach(({ name, index }) => {
        const desc = values[index];
        if (desc) {
          properties.push({
            name: name,
            type: "string",
            required: false,
            description: desc
          });
        }
      });

      events.push({
        platforms,
        block: values[blockIndex] || "",
        actionDescription: values[actionDescIndex] || "",
        category: values[categoryIndex],
        action: values[actionIndex],
        name: values[nameIndex] || "",
        valueDescription: values[valueIndex] || "",
        properties
      });
    }

    return events;
  }, []);

  const previewMutation = useMutation({
    mutationFn: async (parsedEvents: ParsedEvent[]): Promise<ImportPreview> => {
      const response = await apiRequest("POST", "/api/events/import/preview", { events: parsedEvents });
      return response.json();
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedDuplicates(new Set(data.existingEvents.map((_, i) => i)));
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка предпросмотра",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const importMutation = useMutation({
    mutationFn: async (data: {
      newEvents: ParsedEvent[];
      updateEvents: { parsed: ParsedEvent; existingId: number }[];
    }): Promise<ImportResult> => {
      const response = await apiRequest("POST", "/api/events/import", data);
      return response.json();
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Импорт завершен",
        description: `Создано: ${result.created}, Обновлено: ${result.updated}, Пропущено: ${result.skipped}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка импорта",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseCsv(content);
      if (parsed.length === 0) {
        toast({
          title: "Ошибка",
          description: "Не удалось найти события в CSV файле",
          variant: "destructive",
        });
        return;
      }
      setIsOpen(true);
      setImportResult(null);
      previewMutation.mutate(parsed);
    };
    reader.readAsText(file, "UTF-8");
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [parseCsv, previewMutation, toast]);

  const handleImport = useCallback(() => {
    if (!preview) return;

    const updateEvents = duplicateAction === "update" 
      ? preview.existingEvents
          .filter((_, i) => selectedDuplicates.has(i))
          .map(e => ({ parsed: e.parsed, existingId: e.existingId }))
      : [];

    importMutation.mutate({
      newEvents: preview.newEvents,
      updateEvents
    });
  }, [preview, duplicateAction, selectedDuplicates, importMutation]);

  const handleClose = () => {
    setIsOpen(false);
    setPreview(null);
    setImportResult(null);
    setDuplicateAction("skip");
    setSelectedDuplicates(new Set());
  };

  const toggleDuplicate = (index: number) => {
    const newSet = new Set(selectedDuplicates);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedDuplicates(newSet);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-csv-file"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        data-testid="button-import-csv"
      >
        <Upload className="w-4 h-4 mr-2" />
        Импорт
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Импорт событий из CSV
            </DialogTitle>
            <DialogDescription>
              Просмотрите события перед импортом
            </DialogDescription>
          </DialogHeader>

          {previewMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Анализ файла...</span>
            </div>
          )}

          {importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-medium">
                <CheckCircle className="w-6 h-6 text-green-500" />
                Импорт завершен
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.created}</div>
                  <div className="text-sm text-muted-foreground">Создано</div>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-sm text-muted-foreground">Обновлено</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-600">{importResult.skipped}</div>
                  <div className="text-sm text-muted-foreground">Пропущено</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="font-medium text-red-600 mb-2">Ошибки:</div>
                  <ul className="text-sm text-red-600 list-disc pl-4">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button onClick={handleClose} data-testid="button-close-import">Закрыть</Button>
              </DialogFooter>
            </div>
          )}

          {preview && !importResult && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-500">{preview.newEvents.length}</Badge>
                  <span>Новых событий</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-yellow-500">{preview.existingEvents.length}</Badge>
                  <span>Существующих событий</span>
                </div>
              </div>

              {preview.existingEvents.length > 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    Найдены существующие события
                  </div>
                  <RadioGroup
                    value={duplicateAction}
                    onValueChange={(v) => setDuplicateAction(v as "update" | "skip")}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="update" id="update" data-testid="radio-update-duplicates" />
                      <Label htmlFor="update">Обновить события (создать новую версию)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id="skip" data-testid="radio-skip-duplicates" />
                      <Label htmlFor="skip">Пропустить эти события</Label>
                    </div>
                  </RadioGroup>

                  {duplicateAction === "update" && (
                    <ScrollArea className="h-40 border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Версия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.existingEvents.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDuplicates.has(i)}
                                  onCheckedChange={() => toggleDuplicate(i)}
                                  data-testid={`checkbox-duplicate-${i}`}
                                />
                              </TableCell>
                              <TableCell>{e.parsed.category}</TableCell>
                              <TableCell>{e.parsed.action}</TableCell>
                              <TableCell>v{e.existingVersion}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              )}

              {preview.newEvents.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Новые события:</div>
                  <ScrollArea className="h-48 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Платформы</TableHead>
                          <TableHead>Свойства</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.newEvents.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell>{e.category}</TableCell>
                            <TableCell>{e.action}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {e.platforms.map(p => (
                                  <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{e.properties.length}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Ошибки парсинга:
                  </div>
                  <ul className="text-sm text-red-600 list-disc pl-4">
                    {preview.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
                  Отмена
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={importMutation.isPending || (preview.newEvents.length === 0 && (duplicateAction === "skip" || selectedDuplicates.size === 0))}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Импортировать
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
