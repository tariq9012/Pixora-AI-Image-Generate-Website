import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASPECT_RATIOS, MODELS, RESOLUTIONS } from "@/lib/mock-data";
import {
  changePasswordFn,
  logoutAllOtherSessionsFn,
  requestEmailChangeFn,
  resendVerificationFn,
  updateProfileFn,
} from "@/lib/auth/functions";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Settings — Pixora AI" },
      { name: "description", content: "Account, generation defaults, notifications and privacy." },
      { property: "og:title", content: "Settings — Pixora AI" },
      { property: "og:description", content: "Tune Pixora to the way you work." },
    ],
  }),
  component: SettingsPage,
});

function Row({
  title,
  description,
  defaultChecked = false,
}: {
  title: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function ProfileInfoCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await updateProfileFn({ data: { name, username } });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success("Profile saved");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-panel space-y-4 p-6">
      <h2 className="text-sm font-medium text-foreground">Profile</h2>
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullname">Full name</Label>
          <Input id="fullname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function EmailCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const requestChange = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestEmailChangeFn({ data: { newEmail, currentPassword } });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success("Check your new inbox to confirm the change");
      setShowChangeForm(false);
      setNewEmail("");
      setCurrentPassword("");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const result = await resendVerificationFn();
      if (result.success) {
        toast.success("Verification email sent");
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="surface-panel space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Email</h2>
        {user?.emailVerified ? (
          <Badge variant="outline">Verified</Badge>
        ) : (
          <Badge variant="outline" className="text-amber-500">
            Unverified
          </Badge>
        )}
      </div>
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{user?.email}</p>
      {!user?.emailVerified ? (
        <Button variant="outline" size="sm" onClick={() => void resend()} disabled={resending}>
          {resending ? "Sending…" : "Resend verification email"}
        </Button>
      ) : null}
      {showChangeForm ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="newEmail">New email</Label>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailPassword">Current password</Label>
            <Input
              id="emailPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void requestChange()} disabled={busy}>
              {busy ? "Sending…" : "Send confirmation link"}
            </Button>
            <Button variant="outline" onClick={() => setShowChangeForm(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowChangeForm(true)}>
          Change email
        </Button>
      )}
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await changePasswordFn({ data: { currentPassword, newPassword } });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-panel space-y-4 p-6">
      <h2 className="text-sm font-medium text-foreground">Password</h2>
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </Button>
    </div>
  );
}

function SessionsCard() {
  const [busy, setBusy] = useState(false);

  const logoutOthers = async () => {
    setBusy(true);
    try {
      const result = await logoutAllOtherSessionsFn();
      if (result.success) {
        toast.success("Logged out of all other devices");
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-panel space-y-4 p-6">
      <h2 className="text-sm font-medium text-foreground">Sessions</h2>
      <p className="text-sm text-muted-foreground">
        This device stays signed in. Use this if you think another device or browser still has
        access to your account.
      </p>
      <Button variant="outline" onClick={() => void logoutOthers()} disabled={busy}>
        {busy ? "Working…" : "Log out of all other devices"}
      </Button>
    </div>
  );
}

function DangerZoneCard() {
  return (
    <div className="surface-panel space-y-4 p-6">
      <h2 className="text-sm font-medium text-foreground">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        Account deletion isn't available yet — it needs a retention-safe workflow that keeps billing
        and audit history intact. Contact support if you'd like your account disabled in the
        meantime.
      </p>
      <Button variant="outline" disabled>
        Delete account
      </Button>
    </div>
  );
}

function SettingsPage() {
  return (
    <AppShell title="Settings" description="Manage your account and creation defaults.">
      <Tabs defaultValue="account" className="max-w-3xl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="generation">Generation</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-5 space-y-6">
          <ProfileInfoCard />
          <EmailCard />
          <PasswordCard />
          <SessionsCard />
          <DangerZoneCard />
        </TabsContent>

        <TabsContent value="appearance" className="mt-5">
          <div className="surface-panel divide-y divide-border px-6">
            <Row title="Dark interface" description="Pixora is dark by design." defaultChecked />
            <Row title="Reduced motion" description="Minimise animation and parallax." />
            <Row title="Compact grid" description="Show more images per row." />
          </div>
        </TabsContent>

        <TabsContent value="generation" className="mt-5">
          <div className="surface-panel space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Default model</Label>
                <Select defaultValue={MODELS[0]!.name}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Aspect ratio</Label>
                <Select defaultValue={ASPECT_RATIOS[0]!}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resolution</Label>
                <Select defaultValue={RESOLUTIONS[0]!}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <Row
              title="Auto-enhance prompts"
              description="Let Pixora refine short prompts before generating."
              defaultChecked
            />
            <Row
              title="Save originals"
              description="Keep the pre-edit version of every image."
              defaultChecked
            />
            <Button onClick={() => toast.success("Generation defaults saved")}>
              Save defaults
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-5">
          <div className="surface-panel divide-y divide-border px-6">
            <Row
              title="Generation complete"
              description="Notify me when a job finishes."
              defaultChecked
            />
            <Row
              title="Credit alerts"
              description="Warn me when credits drop below 100."
              defaultChecked
            />
            <Row title="Product updates" description="New models and features." />
            <Row title="Marketing emails" description="Occasional offers and tips." />
          </div>
        </TabsContent>

        <TabsContent value="privacy" className="mt-5">
          <div className="surface-panel divide-y divide-border px-6">
            <Row
              title="Public profile"
              description="Show my profile and creations in Explore."
              defaultChecked
            />
            <Row title="Private generations" description="New images stay visible only to me." />
            <Row title="Allow remixing" description="Let others reuse my prompts." defaultChecked />
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
