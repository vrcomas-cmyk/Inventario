import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfigurarHojaCliente from "./configurar-cliente";
import type { Hoja } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConfigurarHojaPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil?.rol !== "admin") {
    return <p className="muted">Solo el admin puede configurar hojas.</p>;
  }

  const { data: hoja, error } = await supabase
    .from("hojas")
    .select("id,nombre,descripcion,columnas,modo_visualizacion,roles_visibles,columnas_por_rol,filtros_por_fila,permite_seleccion,activa")
    .eq("id", id)
    .single<Hoja>();
  if (error || !hoja) notFound();

  return <ConfigurarHojaCliente hoja={hoja} />;
}
