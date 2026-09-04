export type Role = "admin" | "member" | "viewer"

// Orthogonal to Role: Role governs create/edit/delete permission level, Category
// governs data *scope* — an Agronomist has the exact same permissions as any other
// Lab Member at their role, just hard-restricted to their assigned project(s). See
// lib/get-user-filters.ts (getEffectiveScope).
export type UserCategory = "lab_member" | "agronomist"

export function isAgronomist(category?: string | null): boolean {
  return category === "agronomist"
}

export function isAdmin(role: Role): boolean {
  return role === "admin"
}

export function canCreate(role: Role): boolean {
  return role !== "viewer"
}

export function canEdit(role: Role): boolean {
  return role !== "viewer"
}

export function canDelete(role: Role, editMode: boolean): boolean {
  return (role === "admin" || role === "member") && editMode
}
