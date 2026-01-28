import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { EventForm, type EventFormData } from "@/components/EventForm";

interface EventEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: (EventFormData & { id?: number }) | null;
  mode?: "create" | "edit";
  onSuccess?: () => void;
}

export function EventEditSheet({
  open,
  onOpenChange,
  event,
  mode,
  onSuccess,
}: EventEditSheetProps) {
  const isEdit = mode === "edit" || !!event;
  
  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        className="sm:max-w-2xl w-full flex flex-col h-full" 
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-6 px-1">
          <SheetTitle>
            {isEdit ? "Редактировать событие" : "Создать новое событие"}
          </SheetTitle>
          <SheetDescription>
            Определите схему и свойства вашего аналитического события.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overflow-x-visible -mx-6 px-7 py-1">
          <EventForm
            mode={isEdit ? "edit" : "create"}
            initialData={event || undefined}
            onSuccess={handleSuccess}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
