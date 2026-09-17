import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TestTube, Plane, Wheat, Table2, type LucideIcon } from "lucide-react";

const tiles: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    href: "/tests",
    label: "Tests",
    description: "Manage test types and their data collection templates.",
    icon: TestTube,
  },
  {
    href: "/drones",
    label: "Equipment",
    description: "Manage drones and other field equipment.",
    icon: Plane,
  },
  {
    href: "/drones/flights",
    label: "Drone Flights",
    description: "View and manage individual drone flight records.",
    icon: Plane,
  },
  {
    href: "/crops",
    label: "Crops",
    description: "Manage crop types tracked across experiments.",
    icon: Wheat,
  },
  {
    href: "/data-tables",
    label: "Data Tables",
    description: "Manage custom reference data tables.",
    icon: Table2,
  },
];

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-stone-900">Inventory</h2>
      <p className="text-sm text-stone-500">
        Manage tests, equipment, drone flights, crops, and data tables.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <Icon className="h-6 w-6 text-green-600" />
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
