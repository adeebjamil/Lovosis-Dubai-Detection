import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <FontAwesomeIcon icon={icon} className="mb-4 text-[2.5rem] text-gray-600" />
      <h5 className="card-title">{title}</h5>
      {description && <p className="text-muted mt-2 max-w-md">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
