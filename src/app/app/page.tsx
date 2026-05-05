import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtFecha } from "@/lib/utils";

type HojaListItem = {
  id: string;
  nombre: string;
  descripcion: string | null;
  subida_en: string;
  activa: boolean;
  snapshot_version: number;
  permite_seleccion: boolean;
};

export const dynamic = "force-dynamic";

export default async function HojasPage() {
  const supabase = await createClient();
  const { data: hojas, error } = await supabase
    .from("hojas")
    .select("id,nombre,descripcion,subida_en,activa,snapshot_version,permite_seleccion")
    .order("subida_en", { ascending: false })
    .returns<HojaListItem[]>();

  if (error) {
    return <p className="text-red-600 text-sm">Error al cargar hojas: {error.message}</p>;
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold mb-1">Hojas disponibles</h1>
        <p className="muted text-sm">Selecciona una hoja para ver y filtrar sus datos.</p>
      </div>

      {hojas && hojas.length === 0 && (
        <div className="card p-8 text-center">
          <p className="muted text-sm">No hay hojas cargadas todavía.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {hojas?.map((h) => (
          <Link
            key={h.id}
            href={`/app/hojas/${h.id}`}
            className="card p-4 hover:bg-[rgb(var(--bg-alt))] transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium">{h.nombre}</h3>
              {!h.activa && (
                <span className="text-xs px-2 py-0.5 bg-[rgb(var(--bg-alt))] rounded muted">
                  inactiva
                </span>
              )}
            </div>
            {h.descripcion && (
              <p className="muted text-xs mb-3 line-clamp-2">{h.descripcion}</p>
            )}
            <p className="muted text-xs">
              Actualizada {fmtFecha(h.subida_en)} · v{h.snapshot_version}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
