import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TablaHoja from "./tabla-hoja";
import type { Hoja, Seleccion } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HojaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [hojaRes, seleccionesRes, perfilRes] = await Promise.all([
    supabase
      .from("hojas")
      .select("id,nombre,descripcion,mapeo,columnas,permite_seleccion,activa,subida_en,snapshot_version,modo_visualizacion,roles_visibles,columnas_por_rol,filtros_por_fila")
      .eq("id", id)
      .single<Hoja>(),
    supabase
      .from("selecciones")
      .select("id,fila_id,hoja_id,usuario_id,datos_snapshot,hash_dedupe,estado,comentario,confirmada_en")
      .eq("hoja_id", id),
    supabase
      .from("usuarios")
      .select("id,email,nombre,rol")
      .eq("id", user.id)
      .single(),
  ]);

  if (hojaRes.error || !hojaRes.data) notFound();
  const hoja = hojaRes.data;
  const selecciones = (seleccionesRes.data ?? []) as Seleccion[];
  const perfil = perfilRes.data;

  // Conteo total para mostrar progreso
  const { count: totalFilas } = await supabase
    .from("filas")
    .select("*", { count: "exact", head: true })
    .eq("hoja_id", id);

  const usuarioIds = [...new Set(selecciones.map((s) => s.usuario_id))];
  const { data: usuariosSeleccion } = await supabase
    .from("usuarios")
    .select("id,nombre,email")
    .in("id", usuarioIds.length > 0 ? usuarioIds : ["00000000-0000-0000-0000-000000000000"]);
  const mapaUsuarios = new Map(
    (usuariosSeleccion ?? []).map((u) => [u.id, u.nombre || u.email])
  );

  return (
    <TablaHoja
      hoja={hoja}
      totalFilas={totalFilas ?? 0}
      selecciones={selecciones}
      mapaUsuarios={Object.fromEntries(mapaUsuarios)}
      miUsuarioId={perfil?.id ?? null}
      miRol={perfil?.rol ?? null}
    />
  );
}
