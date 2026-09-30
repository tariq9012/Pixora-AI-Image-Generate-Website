import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { ImageGrid } from "@/components/pixora/image-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CREATIONS, POPULAR_PROMPTS, PROJECTS } from "@/lib/mock-data";

export const Route = createFileRoute("/projects/$projectId")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Project — Pixora AI" },
      { name: "description", content: "Project assets, prompts, references and versions." },
      { property: "og:title", content: "Project — Pixora AI" },
      { property: "og:description", content: "Everything created for this project." },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]!;
  const images = CREATIONS.slice(0, 8);

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/projects">
          <ArrowLeft className="size-4" /> All projects
        </Link>
      </Button>

      <div className="surface-panel overflow-hidden">
        <img src={project.cover} alt={project.name} className="h-48 w-full object-cover sm:h-64" />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              {project.name}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{project.desc}</p>
            <div className="mt-3 flex gap-2">
              <Badge variant="outline">{project.assets} assets</Badge>
              <Badge variant="outline">Updated {project.updated}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => toast.info("Project details editable in demo")}
            >
              <Pencil className="size-4" /> Edit
            </Button>
            <Button asChild>
              <Link to="/studio">
                <Plus className="size-4" /> Add creation
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="images" className="mt-6">
        <TabsList>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>
        <TabsContent value="images" className="mt-5">
          <ImageGrid items={images} />
        </TabsContent>
        <TabsContent value="prompts" className="mt-5 space-y-3">
          {POPULAR_PROMPTS.map((p) => (
            <div
              key={p}
              className="surface-panel flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <span className="text-sm text-foreground">{p}</span>
              <Button size="sm" variant="ghost" onClick={() => toast.success("Prompt copied")}>
                Copy
              </Button>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="references" className="mt-5">
          <ImageGrid items={CREATIONS.slice(8, 12)} />
        </TabsContent>
        <TabsContent value="versions" className="mt-5 space-y-3">
          {["v4 — final grade", "v3 — colour pass", "v2 — composition fix", "v1 — first pass"].map(
            (v, i) => (
              <div
                key={v}
                className="surface-panel flex items-center justify-between px-4 py-3.5 text-sm"
              >
                <span className="text-foreground">{v}</span>
                <span className="text-xs text-muted-foreground">
                  {i === 0 ? "Current" : `${i + 1} days ago`}
                </span>
              </div>
            ),
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
