"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, LogOut } from "lucide-react";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import type { Role } from "@/lib/roles";

interface HeaderProps {
  title: string;
  editMode?: boolean;
  role?: Role;
}

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function Header({ title, editMode, role }: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const name = session?.user?.name || session?.user?.email || "User";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {editMode && (
          <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
            Edit Mode
          </span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
          <span className="text-sm text-slate-600 hidden sm:block">{name}</span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-emerald-600 text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span className="truncate">{name}</span>
              {role && (
                <span className="text-xs font-medium text-slate-500 shrink-0">
                  {roleLabels[role]}
                </span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setChangePasswordOpen(true)}
              className="cursor-pointer"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change Password
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={async () => { await signOut({ redirect: false }); router.push("/login"); }}
              className="text-red-600 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <ChangePasswordForm
            email={session?.user?.email ?? ""}
            onSuccess={() => setChangePasswordOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </header>
  );
}
