import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Estafy CRM Login",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        const limit = checkRateLimit(rateLimitKey(request as unknown as Request | undefined, "login", email), { max: 30, windowMs: 15 * 60_000 });

        if (!limit.ok || !email || !password) {
          console.warn("[auth] login rejected before lookup", {
            email,
            hasPassword: Boolean(password),
            rateLimitOk: limit.ok,
          });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        console.warn("[auth] login lookup", {
          email,
          foundUser: Boolean(user),
          hasPasswordHash: Boolean(user?.passwordHash),
          active: user?.active,
        });
        if (!user?.passwordHash || user.active === false) {
          console.warn("[auth] login rejected after database lookup", {
            email,
            hasUser: Boolean(user),
            hasPasswordHash: Boolean(user?.passwordHash),
            active: user?.active,
          });
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          console.warn("[auth] invalid password", { email, userId: user.id });
          return null;
        }

        console.warn("[auth] login accepted", { email, userId: user.id, role: user.role });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }

      return session;
    },
  },
};
