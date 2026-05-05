import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsuariosCliente from "./usuarios-cliente";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: yo } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single();
  if (yo?.rol !== "admin") {
    return <p className="muted">Solo el rol admin puede gestionar usuarios.</p>;
  }

  const [usuariosRes, asignacionesRes] = await Promise.all([
    supabase.from("usuarios").select("id,email,nombre,rol,activo").order("nombre"),
    supabase.from("asignaciones").select("id,usuario_id,grupo_vendedor,zona,es_zona_extra"),
  ]);

  return (
    <UsuariosCliente
      usuarios={usuariosRes.data ?? []}
      asignaciones={asignacionesRes.data ?? []}
    />
  );
}
