import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { StatusBadge } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_USERS } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/users")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Users — Pixora Admin" },
      { name: "description", content: "Search, filter and manage Pixora accounts." },
      { property: "og:title", content: "Users — Pixora Admin" },
      { property: "og:description", content: "Account management for the Pixora platform." },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("all");

  const rows = useMemo(
    () =>
      ADMIN_USERS.filter(
        (u) =>
          (plan === "all" || u.plan === plan) &&
          (!query ||
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            u.email.toLowerCase().includes(query.toLowerCase())),
      ),
    [query, plan],
  );

  return (
    <AdminShell title="Users" description={`${ADMIN_USERS.length} accounts on the platform.`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email..."
            className="pl-9"
          />
        </div>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="Free">Free</SelectItem>
            <SelectItem value="Creator">Creator</SelectItem>
            <SelectItem value="Pro">Pro</SelectItem>
            <SelectItem value="Enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="surface-panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Generations</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.email}>
                <TableCell>
                  <p className="text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{u.plan}</Badge>
                </TableCell>
                <TableCell className="text-right">{u.credits.toLocaleString()}</TableCell>
                <TableCell className="text-right">{u.generations.toLocaleString()}</TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{u.joined}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.info(`Viewing ${u.name}`)}>
                        View profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success("Credits added")}>
                        Add credits
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success("Plan changed")}>
                        Change plan
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success("Account suspended")}>
                        Suspend
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No users match those filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
