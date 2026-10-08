// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into /frontend.
// Reference: frontend/src/app/admin/(panel)/page.tsx  (Overview dashboard)
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faChartLine, faCashRegister } from "@fortawesome/free-solid-svg-icons";
import { SalesChartCard, StatCard } from "@/components/ui/Cards";

// Demo data — replace with API data once the overview defines the metrics.
const DEMO = {
  week: [
    { label: "Mon", value: 1 }, { label: "Tue", value: 2 }, { label: "Wed", value: 2 },
    { label: "Thu", value: 3 }, { label: "Fri", value: 3 }, { label: "Sat", value: 4 },
    { label: "Sun", value: 3 },
  ],
  month: [
    { label: "W1", value: 2 }, { label: "W2", value: 3 }, { label: "W3", value: 2.5 },
    { label: "W4", value: 4 },
  ],
};

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button id="btn-new-task" className="btn btn-primary btn-sm">
          <FontAwesomeIcon icon={faPlus} /> New Task
        </button>
        <div className="btn-group">
          <button id="btn-share" className="btn btn-outline-gray btn-sm">Share</button>
          <button id="btn-export" className="btn btn-outline-gray btn-sm">Export</button>
        </div>
      </div>

      <SalesChartCard title="Sales Value" value="$10,567" change={10.57} data={DEMO} />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Customers" value="345k" icon={faChartLine} period="Feb 1 - Apr 1" trend={18.2} />
        <StatCard title="Revenue" value="$43,594" icon={faCashRegister} period="Feb 1 - Apr 1" trend={28.4} />
        {/* Donut "Traffic Share" card goes here (Recharts PieChart, see design-system §5) */}
      </div>
    </div>
  );
}
