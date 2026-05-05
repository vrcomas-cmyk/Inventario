import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Usuario } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("id,email,nombre,rol,activo")
    .eq("id", user.id)
    .single<Usuario>();

  const rol = perfil?.rol ?? "ejecutivo";
  const esAdmin = rol === "admin";
  const esAdminOAnalista = rol === "admin" || rol === "analista";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[rgb(var(--border))] bg-[rgb(var(--bg))]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/app" className="font-semibold">Inventarios</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/app" className="muted hover:text-[rgb(var(--fg))]">Hojas</Link>
              {esAdmin && (
                <Link href="/app/cargar" className="muted hover:text-[rgb(var(--fg))]">Cargar archivo</Link>
              )}
              {esAdminOAnalista && (
                <Link href="/app/selecciones" className="muted hover:text-[rgb(var(--fg))]">Selecciones</Link>
              )}
              {esAdmin && (
                <Link href="/app/usuarios" className="muted hover:text-[rgb(var(--fg))]">Usuarios</Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="muted">{perfil?.nombre ?? perfil?.email}</span>
            <span className="muted text-xs px-2 py-0.5 border border-[rgb(var(--border))] rounded">
              {rol}
            </span>
            <form action="/auth/logout" method="post">
              <button className="btn btn-ghost text-xs" type="submit">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
