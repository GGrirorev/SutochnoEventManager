import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Check, AlertCircle, Clock, XCircle, Info, Beaker } from "lucide-react";

// Implementation Status Variants
const statusVariants = cva(
  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
  {
    variants: {
      status: {
        // Implementation Statuses
        внедрено: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
        в_разработке: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        черновик: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
        архив: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
        
        // Validation Statuses
        корректно: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
        ошибка: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
        предупреждение: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        ожидает_проверки: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
      },
      size: {
        sm: "text-[10px] px-2 h-5",
        md: "text-xs px-2.5 h-6",
        lg: "text-sm px-3 h-7"
      }
    },
    defaultVariants: {
      size: "md"
    }
  }
);

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusVariants> {
  status: string;
  label?: string;
}

export function StatusBadge({ className, status, size, label, ...props }: StatusBadgeProps) {
  // Map internal status strings to readable labels if not provided
  const getLabel = (s: string) => {
    if (label) return label;
    return s.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getIcon = (s: string) => {
    switch (s) {
      case 'внедрено':
      case 'корректно':
        return <Check className="w-3 h-3" />;
      case 'ошибка':
      case 'архив':
        return <XCircle className="w-3 h-3" />;
      case 'предупреждение':
      case 'в_разработке':
        return <AlertCircle className="w-3 h-3" />;
      case 'черновик':
        return <Beaker className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  // Safe cast for variant type
  const variantStatus = status as VariantProps<typeof statusVariants>['status'];

  return (
    <span className={cn(statusVariants({ status: variantStatus, size }), className)} {...props}>
      {getIcon(status)}
      {getLabel(status)}
    </span>
  );
}
