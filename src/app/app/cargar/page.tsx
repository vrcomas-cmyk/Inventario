import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CargarCliente from "./cargar-cliente";

export default async function CargarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil?.rol !== "admin") {
    return <p className="muted">Solo el rol admin puede cargar archivos.</p>;
  }

  const { data: plantillas } = await supabase
    .from("plantillas_mapeo")
    .select("id,nombre,config")
    .order("nombre");

  return <CargarCliente plantillas={plantillas ?? []} />;
}
