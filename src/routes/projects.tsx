import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { EmptyState } from "@/components/pixora/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PROJECTS } from "@/lib/mock-data";

export const Route = createFileRoute("/projects")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Projects — Pixora AI" },
      { name: "description", content: "Group creations, prompts and references into projects." },
      { property: "og:title", content: "Projects — Pixora AI" },
      { property: "og:description", content: "Organise every campaign in one place." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [projects, setProjects] = useState(PROJECTS);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const create = () => {
    if (!name.trim()) {
      toast.error("Give the project a name");
      return;
    }
    setProjects((p) => [
      {
        id: `p${p.length + 1}`,
        name,
        desc: desc || "No description yet.",
        assets: 0,
        cover: PROJECTS[0]!.cover,
        updated: "Just now",
      },
      ...p,
    ]);
    setName("");
    setDesc("");
    setOpen(false);
    toast.success("Project created");
  };

  return (
    <AppShell
      title="Projects"
      description="Keep campaigns, prompts and references together."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Create Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>
                Projects group creations, prompts, references and versions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pname">Project name</Label>
                <Input
                  id="pname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Spring Campaign"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdesc">Description</Label>
                <Textarea
                  id="pdesc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="What is this project for?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create}>Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {projects.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated"
            >
              <img
                src={p.cover}
                alt={p.name}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="p-4">
                <h3 className="font-display text-base font-semibold text-foreground">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.desc}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {p.assets} assets · {p.updated}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Group your creations by campaign, client or channel."
          action={<Button onClick={() => setOpen(true)}>Create Project</Button>}
        />
      )}
    </AppShell>
  );
}
