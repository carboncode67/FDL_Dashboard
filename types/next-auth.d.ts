import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: "admin" | "member" | "viewer"
      category: "lab_member" | "agronomist"
      // Planned Changes #10 — lab data silo (docs/lab-data-silo-plan.md).
      // Null until Phase 3's migration 068 makes users.lab_id NOT NULL; every
      // reader must handle null (falls back to TENANT_ENFORCEMENT=off behavior).
      lab_id: number | null
      lab_slug: string | null
      platform_admin: boolean
    }
  }
  interface User {
    role?: "admin" | "member" | "viewer"
    category?: "lab_member" | "agronomist"
    lab_id?: number | null
    lab_slug?: string | null
    platform_admin?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: "admin" | "member" | "viewer"
    category?: "lab_member" | "agronomist"
    lab_id?: number | null
    lab_slug?: string | null
    platform_admin?: boolean
  }
}
