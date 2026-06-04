"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Map,
  FlaskConical,
  Layers,
  TestTube,
  Plane,
  Wheat,
  Users,
  Beaker,
  ChevronRight,
  BookUser,
  ShieldCheck,
  Upload,
  SlidersHorizontal,
  MessageCircle,
  BarChart2,
} from "lucide-react";

const adminNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Farmers", icon: BookUser },
  { href: "/lab-members", label: "Lab Members", icon: Users },
  { href: "/lab-uploads", label: "Data Uploads", icon: Upload },
  { href: "/data-sorting", label: "Data Sorting", icon: SlidersHorizontal },
  { href: "/users", label: "Users", icon: ShieldCheck },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/activity-report", label: "Activity Report", icon: BarChart2 },
];

const fieldOpsNav = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/farms", label: "Farms", icon: Building2 },
  { href: "/fields", label: "Fields", icon: Map },
  { href: "/experiment-zones", label: "Experiment Zones", icon: Layers },
];

const referenceNav = [
  { href: "/treatments", label: "Treatments", icon: Beaker },
  { href: "/tests", label: "Tests", icon: TestTube },
  { href: "/drones", label: "Drones", icon: Plane },
  { href: "/crops", label: "Crops", icon: Wheat },
  { href: "/treatment-protocols", label: "Treatment Protocols", icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-slate-100 flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <ChevronRight className="h-5 w-5 text-emerald-400" />
          <span className="text-lg font-bold tracking-tight">FDL Dashboard</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {[
          { label: "Admin", items: adminNav },
          { label: "Field Operations", items: fieldOpsNav },
          { label: "Reference Data", items: referenceNav },
        ].map(({ label, items }) => (
          <div key={label}>
            <p className="px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {label}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label: itemLabel, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                      pathname === href
                        ? "bg-emerald-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {itemLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
