import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  List, 
  Database,
  Users,
  LogOut,
  Puzzle
} from "lucide-react";
import logoHeader from "@assets/logo-header_1769085215107.png";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@shared/schema";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "Обзор", icon: LayoutDashboard, href: "/" },
  { label: "Схема событий", icon: List, href: "/events" },
  { label: "Свойства событий", icon: Database, href: "/properties" },
];

const ADMIN_ITEMS = [
  { label: "Пользователи", icon: Users, href: "/users" },
  { label: "Модули", icon: Puzzle, href: "/plugins" },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 h-screen border-r bg-card flex flex-col fixed left-0 top-0 z-30 hidden md:flex">
      {/* Brand */}
      <div className="h-20 flex items-center px-4 border-b">
        <img src={logoHeader} alt="Sutochno.ru Аналитика" className="h-10 w-auto object-contain" />
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 overflow-y-auto">
        <div className="px-3 py-2 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
          Рабочая область
        </div>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`nav-${item.href.slice(1) || 'dashboard'}`}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="px-3 py-2 mt-6 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
          Администрирование
        </div>
        <div className="space-y-1">
          {ADMIN_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`nav-${item.href.slice(1)}`}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* User / Footer */}
      <UserFooter />
    </div>
  );
}

function UserFooter() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="p-4 border-t bg-muted/20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
          {initials}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate" data-testid="text-current-user-name">
            {user.name}
          </p>
          <p className="text-xs text-muted-foreground truncate" data-testid="text-current-user-role">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
