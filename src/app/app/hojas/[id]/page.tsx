import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TablaHoja from "./tabla-hoja";
import type { Hoja, Fila, Seleccion } from "@/lib/types";

export const dynamic = "force-dynamic";

const TAMANO_LOTE = 1000;
const MAX_FILAS = 50000; // Tope de seguridad

async function traerTodasLasFilas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hojaId: string
): Promise<Fila[]> {
  const todas: Fila[] = [];
  let desde = 0;
  while (desde < MAX_FILAS) {
    const { data, error } = await supabase
      .from("filas")
      .select("id,hoja_id,datos,hash_dedupe,grupo_vendedor,razon_social,zona,snapshot_version")
      .eq("hoja_id", hojaId)
      .range(desde, desde + TAMANO_LOTE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas.push(...(data as Fila[]));
    if (data.length < TAMANO_LOTE) break;
    desde += TAMANO_LOTE;
  }
  return todas;
}

export default async function HojaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await createClient();

  const [hojaRes, filas, seleccionesRes, perfilRes] = await Promise.all([
    supabase
      .from("hojas")
      .select("id,nombre,descripcion,mapeo,columnas,permite_seleccion,activa,subida_en,snapshot_version")
      .eq("id", id)
      .single<Hoja>(),
    traerTodasLasFilas(supabase, id),
    supabase
      .from("selecciones")
      .select("id,fila_id,hoja_id,usuario_id,datos_snapshot,hash_dedupe,estado,comentario,confirmada_en")
      .eq("hoja_id", id),
    supabase.auth.getUser().then(async (r) => {
      if (!r.data.user) return null;
      const { data } = await supabase
        .from("usuarios")
        .select("id,email,nombre,rol")
        .eq("id", r.data.user.id)
        .single();
      return data;
    }),
  ]);

  if (hojaRes.error || !hojaRes.data) notFound();
  const hoja = hojaRes.data;
  const selecciones = (seleccionesRes.data ?? []) as Seleccion[];
  const perfil = perfilRes;

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
      filas={filas}
      selecciones={selecciones}
      mapaUsuarios={Object.fromEntries(mapaUsuarios)}
      miUsuarioId={perfil?.id ?? null}
      miRol={perfil?.rol ?? null}
    />
  );
}
