import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import EmptyState from "@/components/ui/EmptyState";

interface ModulePageProps {
  title: string;
  icon: IconDefinition;
  phase: string;
  description: string;
}

/** Shell for modules that are scheduled in a later phase (keeps navigation working). */
export default function ModulePage({ title, icon, phase, description }: ModulePageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{title}</h1>
        <span className="badge badge-info">{phase}</span>
      </div>
      <div className="card">
        <EmptyState icon={icon} title={`${title} is being built`} description={description} />
      </div>
    </div>
  );
}
