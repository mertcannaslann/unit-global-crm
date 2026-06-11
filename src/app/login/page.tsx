"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("mertcan@unitcrm.com");
  const [password, setPassword] = useState("Mertcan123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("E-posta veya şifre hatalı.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="luxury-grid flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-white shadow-[0_24px_80px_rgba(18,58,111,0.12)] md:grid-cols-[1.05fr_0.95fr]">
        <section className="bg-gradient-to-br from-[#061f41] via-[#0f4c91] to-[#4da3ff] p-8 text-white md:p-12">
          <div className="mb-16 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-blue-100">Emlak Ofisi CRM</p>
          <h1 className="max-w-md text-4xl font-semibold leading-tight md:text-5xl">Real Estate Operating System</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-blue-100">
            Farklı emlak ofislerine hesap aç, kullanıcı limitini belirle, owner ve danışman girişlerini üret, operasyonu tek panelden yönet.
          </p>
          <div className="mt-12 grid gap-3 text-sm text-blue-50">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">Platform Admin: mertcan@unitcrm.com / Mertcan123!</div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">Unit Global Owner: dorukhan@unitglobal.com / Owner123!</div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">Danışman: kaan@unitglobal.com / Consultant123!</div>
          </div>
        </section>

        <section className="p-8 md:p-12">
          <div className="mb-8">
            <p className="text-sm font-medium text-primary">Güvenli giriş</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Operasyon paneline giriş yap</h2>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">E-posta</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Şifre</span>
              <div className="relative">
                <Input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} className="pr-11" />
                <button
                  aria-label="Şifre görünürlüğü"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
