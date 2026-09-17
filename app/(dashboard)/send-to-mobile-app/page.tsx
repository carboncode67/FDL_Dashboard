import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Crosshair, MapPin, FileText, type LucideIcon } from "lucide-react";

const tiles: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    href: "/sampling-maps",
    label: "Sampling Maps",
    description: "Build sampling maps with basemaps, polygons, and points to send to the field.",
    icon: Crosshair,
  },
  {
    href: "/geofences",
    label: "Geofences",
    description: "Define zones that trigger spatial notifications on the mobile app.",
    icon: MapPin,
  },
  {
    href: "/forms",
    label: "Custom Forms",
    description: "Build and assign custom data-collection forms for the mobile app.",
    icon: FileText,
  },
];

export default function SendToMobileAppPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-stone-900">Send to Mobile App</h2>
      <p className="text-sm text-stone-500">
        Choose what to build and push out to the FarmerDataLogger mobile app.
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
