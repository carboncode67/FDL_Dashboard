import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { basePrisma as prisma } from "@/lib/prisma";

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  // Bootstrap: if no users exist, accept admin@lab.com / admin123
  if (stored === "__bootstrap__") {
    return plain === "admin123";
  }
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.compare(plain, stored);
  } catch {
    return plain === stored;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        if (email === "admin@lab.com") {
          let userCount = 0;
          try {
            userCount = await prisma.user.count();
          } catch {
            userCount = 0;
          }

          if (userCount === 0) {
            if (await verifyPassword(password, "__bootstrap__")) {
              return { id: "bootstrap", email: "admin@lab.com", name: "Admin" };
            }
          }
        }

        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;
          const valid = await verifyPassword(password, user.password);
          if (!valid) return null;
          return { id: user.id, email: user.email, name: user.name };
        } catch {
          if (email === "admin@lab.com" && password === "admin123") {
            return { id: "bootstrap", email: "admin@lab.com", name: "Admin" };
          }
          return null;
        }
      },
    }),
  ],
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Bootstrap account is always admin
        if (user.id === "bootstrap") {
          token.role = "admin";
          token.category = "lab_member";
          // Bootstrap only exists before any real user (and therefore any real
          // lab assignment) does — leave lab_id null; nothing enforces on it
          // while TENANT_ENFORCEMENT=off (see docs/lab-data-silo-plan.md).
          token.lab_id = null;
          token.lab_slug = null;
          token.platform_admin = true;
        } else {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: user.id as string },
              select: { role: true, category: true, lab_id: true, platform_admin: true },
            });
            token.role = (dbUser?.role ?? "member") as "admin" | "member" | "viewer";
            token.category = (dbUser?.category ?? "lab_member") as "lab_member" | "agronomist";
            token.lab_id = dbUser?.lab_id ?? null;
            token.platform_admin = dbUser?.platform_admin ?? false;
            token.lab_slug = dbUser?.lab_id != null
              ? (await prisma.lab.findUnique({ where: { id: dbUser.lab_id }, select: { slug: true } }))?.slug ?? null
              : null;
          } catch {
            token.role = "member";
            token.category = "lab_member";
            token.lab_id = null;
            token.lab_slug = null;
            token.platform_admin = false;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role ?? "member") as "admin" | "member" | "viewer";
        session.user.category = (token.category ?? "lab_member") as "lab_member" | "agronomist";
        session.user.lab_id = token.lab_id ?? null;
        session.user.lab_slug = token.lab_slug ?? null;
        session.user.platform_admin = token.platform_admin ?? false;
      }
      return session;
    },
  },
});
