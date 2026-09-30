import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { ImageGrid } from "@/components/pixora/image-card";
import { StatCard } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CREATIONS } from "@/lib/mock-data";
import { updateProfileFn } from "@/lib/auth/functions";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import { setAvatarFn } from "@/lib/storage/functions";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Profile — Pixora AI" },
      { name: "description", content: "Your public Pixora profile, stats and creations." },
      { property: "og:title", content: "Profile — Pixora AI" },
      { property: "og:description", content: "Your creations, stats and bio." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { user } = useRouteContext({ from: "__root__" });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", username: "", bio: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarUpload = useAssetUpload("AVATAR");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (avatarUpload.status === "error" && avatarUpload.error) {
      toast.error(avatarUpload.error);
    }
  }, [avatarUpload.status, avatarUpload.error]);

  useEffect(() => {
    if (avatarUpload.status !== "complete" || !avatarUpload.asset) return;

    const assetId = avatarUpload.asset.id;
    setSavingAvatar(true);
    setAvatarFn({ data: assetId })
      .then((result) => {
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success("Avatar updated");
        window.location.reload();
      })
      .catch((error) => {
        console.error(error);
        toast.error("Something went wrong. Please try again.");
      })
      .finally(() => setSavingAvatar(false));
    // Only re-run when a NEW upload finishes (asset id changes) — not on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUpload.status, avatarUpload.asset?.id]);

  // The route is guarded (beforeLoad above), so this is only a type-level
  // safety net — it should never actually render for a logged-out user.
  if (!user) return null;

  const displayName = user.name || user.email;
  const initials = displayName.slice(0, 2).toUpperCase();
  const joined = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  const openEditor = () => {
    setDraft({ name: user.name ?? "", username: user.username ?? "", bio: user.bio ?? "" });
    setFormError(null);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const result = await updateProfileFn({ data: draft });
      if (!result.success) {
        setFormError(result.message);
        return;
      }
      setOpen(false);
      toast.success("Profile updated");
      // Full reload so root context's `user` (navbar, settings, etc.)
      // reflects the change everywhere without threading fresh state
      // through props.
      window.location.reload();
    } catch (error) {
      console.error(error);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="surface-panel relative overflow-hidden">
        <div className="h-32 bg-gradient-hero sm:h-40" />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative -mt-14">
              <Avatar className="size-20 border-4 border-card">
                {avatarUpload.preview ? (
                  <AvatarImage src={avatarUpload.preview} alt="" />
                ) : user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-xl text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void avatarUpload.upload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Change avatar"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUpload.status === "uploading" || savingAvatar}
                className="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {avatarUpload.status === "uploading" || savingAvatar ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Camera className="size-3.5" />
                )}
              </button>
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground">{displayName}</h1>
              <p className="text-sm text-muted-foreground">
                {user.username ? `@${user.username} · ` : ""}Joined {joined}
              </p>
              {user.bio ? (
                <p className="mt-2 max-w-lg text-sm text-muted-foreground">{user.bio}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">{user.role === "USER" ? "Free plan" : user.role}</Badge>
                {!user.emailVerified ? (
                  <Badge variant="outline" className="text-amber-500">
                    Email unverified
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openEditor}>
                <Pencil className="size-4" /> Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {formError ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="dname">Display name</Label>
                  <Input
                    id="dname"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dusername">Username</Label>
                  <Input
                    id="dusername"
                    value={draft.username}
                    onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbio">Bio</Label>
                  <Textarea
                    id="dbio"
                    rows={3}
                    maxLength={280}
                    value={draft.bio}
                    onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Creations" value="1,204" />
        <StatCard label="Followers" value="8,410" delta="+3.2%" />
        <StatCard label="Likes" value="112k" delta="+9.4%" />
        <StatCard label="Credits used" value="24,880" />
      </div>

      <Tabs defaultValue="creations" className="mt-6">
        <TabsList>
          <TabsTrigger value="creations">Creations</TabsTrigger>
          <TabsTrigger value="liked">Liked</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
        </TabsList>
        <TabsContent value="creations" className="mt-5">
          <ImageGrid items={CREATIONS.slice(0, 12)} />
        </TabsContent>
        <TabsContent value="liked" className="mt-5">
          <ImageGrid items={CREATIONS.filter((c) => c.favorite).slice(0, 8)} />
        </TabsContent>
        <TabsContent value="collections" className="mt-5">
          <ImageGrid items={CREATIONS.slice(12, 20)} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
