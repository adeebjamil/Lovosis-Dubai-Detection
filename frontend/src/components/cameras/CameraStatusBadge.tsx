import { STATUS_META, type CameraStatus } from "@/lib/cameras";

export default function CameraStatusBadge({ status, title }: { status: CameraStatus; title?: string | null }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge ${meta.badge} gap-1.5`} title={title ?? undefined}>
      <span className="status-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
