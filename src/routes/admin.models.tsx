import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MODELS, MODEL_POPULARITY } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/models")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Models — Pixora Admin" },
      { name: "description", content: "Enable, price and monitor Pixora generation models." },
      { property: "og:title", content: "Models — Pixora Admin" },
      { property: "og:description", content: "Model configuration for the platform." },
    ],
  }),
  component: AdminModels,
});

function AdminModels() {
  return (
    <AdminShell title="Models" description="Availability, pricing and load per model.">
      <div className="grid gap-5 lg:grid-cols-2">
        {MODELS.map((m) => {
          const share = MODEL_POPULARITY.find((p) => p.name === m.name)?.value ?? 0;
          return (
            <div key={m.id} className="surface-panel p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">{m.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">{m.cost} credits</Badge>
                <Badge variant="outline">{m.speed} avg</Badge>
                <Badge variant="outline">{share}% of traffic</Badge>
                <Badge variant="outline">{m.badge}</Badge>
              </div>
              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success("Pricing updated")}
                >
                  Edit pricing
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toast.info("Model logs opened")}>
                  View logs
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
