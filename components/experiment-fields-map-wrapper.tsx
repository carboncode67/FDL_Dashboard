import dynamic from "next/dynamic";

export const ExperimentFieldsMapWrapper = dynamic(
  () => import("./experiment-fields-map").then((m) => m.ExperimentFieldsMap),
  { ssr: false, loading: () => <div className="h-[200px] bg-slate-100 rounded-md animate-pulse" /> }
);
