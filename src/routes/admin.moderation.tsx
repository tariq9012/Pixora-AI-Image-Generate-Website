import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODERATION_ITEMS } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/moderation")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Moderation — Pixora Admin" },
      { name: "description", content: "Review reported images, users and prompts." },
      { property: "og:title", content: "Moderation — Pixora Admin" },
      { property: "og:description", content: "Content safety queue for Pixora." },
    ],
  }),
  component: AdminModeration,
});

function AdminModeration() {
  return (
    <AdminShell title="Moderation" description="Reports waiting for a decision.">
      <Tabs defaultValue="images">
        <TabsList className="flex-wrap">
          <TabsTrigger value="images">Reported images</TabsTrigger>
          <TabsTrigger value="users">Reported users</TabsTrigger>
          <TabsTrigger value="prompts">Prompt violations</TabsTrigger>
          <TabsTrigger value="removed">Removed content</TabsTrigger>
        </TabsList>

        <TabsContent value="images" className="mt-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODERATION_ITEMS.images.map((i) => (
              <div key={i.id} className="surface-panel overflow-hidden">
                <img
                  src={i.src}
                  alt={i.reason}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <div className="space-y-2 p-4">
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {i.reason}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {i.id} · reported by {i.reporter} · {i.age}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => toast.success("Approved")}>
                      Approve
                    </Button>
                    <Button size="sm" onClick={() => toast.success("Content removed")}>
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-5 space-y-3">
          {MODERATION_ITEMS.users.map((u) => (
            <div
              key={u.id}
              className="surface-panel flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="text-sm text-foreground">{u.user}</p>
                <p className="text-xs text-muted-foreground">
                  {u.reason} · {u.reports} reports · {u.age}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success("Report dismissed")}
                >
                  Dismiss
                </Button>
                <Button size="sm" onClick={() => toast.success("User suspended")}>
                  Suspend
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="prompts" className="mt-5 space-y-3">
          {MODERATION_ITEMS.prompts.map((p) => (
            <div
              key={p.id}
              className="surface-panel flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="text-sm text-foreground">{p.prompt}</p>
                <p className="text-xs text-muted-foreground">
                  {p.user} · {p.age}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => toast.success("Prompt blocked")}>
                Block prompt
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="removed" className="mt-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODERATION_ITEMS.removed.map((r) => (
              <div key={r.id} className="surface-panel overflow-hidden">
                <img
                  src={r.src}
                  alt={r.reason}
                  loading="lazy"
                  className="aspect-video w-full object-cover opacity-50 grayscale"
                />
                <div className="space-y-1 p-4">
                  <p className="text-sm text-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Removed by {r.by} · {r.age}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => toast.success("Content restored")}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
