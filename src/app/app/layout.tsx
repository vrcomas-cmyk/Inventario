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

  const nombre = perfil?.nombre ?? perfil?.email ?? "";
  const iniciales = nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const primerNombre = nombre.split(" ")[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "rgb(var(--bg))",
          borderBottom: "1px solid rgb(var(--border))",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Brand */}
          <Link
            href="/app"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <img
              src="/assets/logo-degasa.png"
              alt="Degasa"
              style={{ height: 28, width: "auto" }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 300,
                fontSize: 16,
                letterSpacing: "-0.005em",
              }}
            >
              Inventarios
            </span>
          </Link>

          {/* Pill nav */}
          <nav
            style={{
              display: "flex",
              gap: 4,
              background: "rgb(var(--bg-alt))",
              padding: 4,
              borderRadius: 999,
              marginLeft: 8,
            }}
          >
            <NavPill href="/app">Hojas</NavPill>
            {esAdmin && <NavPill href="/app/cargar">Cargar</NavPill>}
            {esAdminOAnalista && <NavPill href="/app/selecciones">Selecciones</NavPill>}
            {esAdmin && <NavPill href="/app/usuarios">Usuarios</NavPill>}
          </nav>

          <div style={{ flex: 1 }} />

          {/* User chip */}
          <form
            action="/auth/logout"
            method="post"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 10px 4px 4px",
                background: "rgb(var(--bg-alt))",
                borderRadius: 999,
                border: "1px solid rgb(var(--border))",
              }}
              title={`${nombre} · ${rol}`}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "rgb(var(--brand-green))",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {iniciales}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{primerNombre}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  background: "rgb(var(--bg))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 999,
                  color: "rgb(var(--fg-muted))",
                }}
              >
                {rol}
              </span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} type="submit">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 1400,
          width: "100%",
          margin: "0 auto",
          padding: "24px 20px",
        }}
      >
        {children}
      </main>
    </div>
  );
}

function NavPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        color: "rgb(var(--fg-muted))",
        textDecoration: "none",
        transition: "background 0.12s, color 0.12s",
      }}
      className="nav-pill"
    >
      {children}
    </Link>
  );
}
