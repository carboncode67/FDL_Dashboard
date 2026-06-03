import { BarChart2 } from "lucide-react";

export default function ActivityReportPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4 text-slate-400">
      <BarChart2 className="h-12 w-12" />
      <p className="text-lg font-medium">Activity Report</p>
      <p className="text-sm text-center max-w-sm">
        This page will show a 2-week activity report covering all three data
        streams — WhatsApp, App (farmers), and App (lab members). Coming soon.
      </p>
    </div>
  );
}
