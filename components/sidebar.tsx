"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Users,
  Beaker,
  SlidersHorizontal,
  Settings2,
  MessageCircle,
  BarChart2,
  Microscope,
  ClipboardList,
  LayoutTemplate,
  Cpu,
  BookOpen,
  Tag,
  Smartphone,
  Boxes,
  BookUser,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const managementNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/contacts", label: "Farmers", icon: BookUser },
  { href: "/farms", label: "Farms", icon: Building2 },
  { href: "/data-sorting", label: "Incoming Data", icon: SlidersHorizontal },
];

const dataCollectionNav: NavItem[] = [
  { href: "/send-to-mobile-app", label: "Send to Mobile App", icon: Smartphone },
  { href: "/methodologies", label: "Methodologies", icon: BookOpen },
  { href: "/experiments", label: "Experiments", icon: Microscope },
];

const advancedNav: NavItem[] = [
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/treatments", label: "Treatment Types", icon: Beaker },
  { href: "/task-templates", label: "Task Templates", icon: LayoutTemplate },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/data-categories", label: "Data Categories", icon: Tag },
];

const adminNav: NavItem[] = [
  { href: "/activity-report", label: "Activity Report", icon: BarChart2 },
  { href: "/lab-members", label: "Lab Members", icon: Users },
  { href: "/whatsapp", label: "Messaging", icon: MessageCircle },
];

interface SidebarProps {
  role: Role;
  className?: string;
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
          active
            ? "bg-green-600 text-white"
            : "text-stone-300 hover:bg-stone-800 hover:text-white"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    </li>
  );
}

export function Sidebar({ role, className, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const sections = [
    { label: "Management", items: managementNav },
    { label: "Data Collection", items: dataCollectionNav },
    { label: "Advanced", items: advancedNav },
  ];

  return (
    <aside
      className={cn(
        "w-60 min-h-screen bg-stone-900 text-stone-100 flex flex-col shrink-0",
        className
      )}
    >
      <div className="px-4 py-5 border-b border-stone-700">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">Farmers Database</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {sections.map(({ label, items }) => (
          <div key={label}>
            <p className="px-2 mb-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
              {label}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label: itemLabel, icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  label={itemLabel}
                  icon={icon}
                  active={pathname === href}
                  onNavigate={onNavigate}
                />
              ))}
              {role === "admin" && label === "Advanced" && (
                <NavLink
                  href="/pipelines"
                  label="Pipelines"
                  icon={Cpu}
                  active={isActive(pathname, "/pipelines")}
                  onNavigate={onNavigate}
                />
              )}
            </ul>
          </div>
        ))}

        <div>
          <p className="px-2 mb-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
            Admin
          </p>
          <ul className="space-y-0.5">
            {adminNav.map(({ href, label: itemLabel, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={itemLabel}
                icon={icon}
                active={pathname === href}
                onNavigate={onNavigate}
              />
            ))}
            {role === "admin" && (
              <NavLink
                href="/admin"
                label="Admin Panel"
                icon={Settings2}
                active={pathname === "/admin"}
                onNavigate={onNavigate}
              />
            )}
          </ul>
        </div>
      </nav>
    </aside>
  );
}
