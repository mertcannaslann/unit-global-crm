import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { demoCredentials, initialData } from "@/lib/demo-data";
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
      name: "Unit Global Demo Login",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        const credential = demoCredentials.find((item) => item.email === email);
        const user = initialData.users.find((item) => item.email === email);

        if (!credential || !user || credential.password !== password) {
          return null;
        }

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
