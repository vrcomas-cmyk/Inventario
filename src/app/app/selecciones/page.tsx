import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeleccionesCliente from "./selecciones-cliente";

export const dynamic = "force-dynamic";

export default async function SeleccionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: yo } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single();
  if (yo?.rol !== "admin" && yo?.rol !== "analista") {
    return <p className="muted">Solo admin y analista pueden ver esta sección.</p>;
  }

  const [selRes, usuariosRes, hojasRes] = await Promise.all([
    supabase
      .from("selecciones")
      .select("id,fila_id,hoja_id,usuario_id,datos_snapshot,hash_dedupe,estado,comentario,confirmada_en")
      .order("confirmada_en", { ascending: false })
      .limit(2000),
    supabase.from("usuarios").select("id,nombre,email,rol"),
    supabase.from("hojas").select("id,nombre"),
  ]);

  return (
    <SeleccionesCliente
      selecciones={selRes.data ?? []}
      usuarios={usuariosRes.data ?? []}
      hojas={hojasRes.data ?? []}
      esAdmin={yo?.rol === "admin"}
    />
  );
}
