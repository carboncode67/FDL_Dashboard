import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

// Simple password comparison - in production use bcrypt
async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  // Bootstrap: if no users exist, accept admin@lab.com / admin123
  if (stored === "__bootstrap__") {
    return plain === "admin123";
  }
  // Try bcrypt if available
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

        // Check if bootstrap account
        if (email === "admin@lab.com") {
          let userCount = 0;
          try {
            userCount = await prisma.user.count();
          } catch {
            // Table might not exist yet
            userCount = 0;
          }

          if (userCount === 0) {
            if (await verifyPassword(password, "__bootstrap__")) {
              return {
                id: "bootstrap",
                email: "admin@lab.com",
                name: "Admin",
              };
            }
          }
        }

        // Normal user lookup
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;
          const valid = await verifyPassword(password, user.password);
          if (!valid) return null;
          return { id: user.id, email: user.email, name: user.name };
        } catch {
          // If users table doesn't exist, allow bootstrap
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
});
