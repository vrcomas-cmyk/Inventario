"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtFecha } from "@/lib/utils";
import type { Seleccion, EstadoSeleccion } from "@/lib/types";

type Usuario = { id: string; nombre: string | null; email: string; rol: string };
type Hoja = { id: string; nombre: string };

export default function SeleccionesCliente({
  selecciones,
  usuarios,
  hojas,
  esAdmin,
}: {
  selecciones: Seleccion[];
  usuarios: Usuario[];
  hojas: Hoja[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [filtroHoja, setFiltroHoja] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [agruparPor, setAgruparPor] = useState<"ninguno"|"cliente"|"usuario"|"hoja">("ninguno");

  const mapaUsuarios = useMemo(
    () => new Map(usuarios.map((u) => [u.id, u])),
    [usuarios]
  );
  const mapaHojas = useMemo(
    () => new Map(hojas.map((h) => [h.id, h.nombre])),
    [hojas]
  );

  // Deduplicar por hash_dedupe (si dos personas seleccionaron lo mismo, mostrar una sola fila con ambas referencias)
  const dedup = useMemo(() => {
    const m = new Map<string, { principal: Seleccion; otros: Seleccion[] }>();
    for (const s of selecciones) {
      const k = `${s.hoja_id}|${s.hash_dedupe}`;
      const ex = m.get(k);
      if (!ex) m.set(k, { principal: s, otros: [] });
      else ex.otros.push(s);
    }
    return [...m.values()];
  }, [selecciones]);

  const filtradas = useMemo(() => {
    return dedup.filter(({ principal }) => {
      if (filtroHoja && principal.hoja_id !== filtroHoja) return false;
      if (filtroEstado && principal.estado !== filtroEstado) return false;
      return true;
    });
  }, [dedup, filtroHoja, filtroEstado]);

  async function cambiarEstado(id: string, estado: EstadoSeleccion) {
    const supabase = createClient();
    await supabase.from("selecciones").update({ estado }).eq("id", id);
    router.refresh();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta selección?")) return;
    const supabase = createClient();
    await supabase.from("selecciones").delete().eq("id", id);
    router.refresh();
  }

  function exportarExcel() {
    import("xlsx").then((XLSX) => {
      const datos = filtradas.map(({ principal, otros }) => {
        const u = mapaUsuarios.get(principal.usuario_id);
        return {
          Hoja: mapaHojas.get(principal.hoja_id) ?? principal.hoja_id,
          Estado: principal.estado,
          Confirmada: fmtFecha(principal.confirmada_en),
          Usuario: u?.nombre || u?.email || principal.usuario_id,
          Rol: u?.rol ?? "",
          Comentario: principal.comentario ?? "",
          OtrosUsuarios: otros
            .map((o) => mapaUsuarios.get(o.usuario_id)?.nombre || o.usuario_id)
            .join(", "),
          ...principal.datos_snapshot,
        };
      });
      const ws = XLSX.utils.json_to_sheet(datos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Selecciones");
      XLSX.writeFile(wb, `selecciones_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Selecciones</h1>
          <p className="muted text-sm">
            {filtradas.length} consolidadas (de {selecciones.length} totales, deduplicadas)
          </p>
        </div>
        <button onClick={exportarExcel} className="btn">Exportar Excel</button>
      </div>

      <div className="card p-3 mb-4 flex flex-wrap gap-3 items-center">
        <select value={filtroHoja} onChange={(e) => setFiltroHoja(e.target.value)}>
          <option value="">Todas las hojas</option>
          {hojas.map((h) => (
            <option key={h.id} value={h.id}>{h.nombre}</option>
          ))}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_gestion">En gestión</option>
          <option value="gestionada">Gestionada</option>
          <option value="cancelada">Cancelada</option>
          <option value="no_disponible">No disponible</option>
        </select>
        <select value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as any)}>
          <option value="ninguno">Sin agrupar</option>
          <option value="hoja">Agrupar por hoja</option>
          <option value="usuario">Agrupar por usuario</option>
        </select>
      </div>

      <div className="card overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[rgb(var(--bg-alt))]">
            <tr>
              <th className="p-2 text-left font-medium">Hoja</th>
              <th className="p-2 text-left font-medium">Datos</th>
              <th className="p-2 text-left font-medium">Usuario(s)</th>
              <th className="p-2 text-left font-medium">Estado</th>
              <th className="p-2 text-left font-medium">Fecha</th>
              <th className="p-2 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(({ principal, otros }) => {
              const u = mapaUsuarios.get(principal.usuario_id);
              return (
                <tr key={principal.id} className="border-t border-[rgb(var(--border))]">
                  <td className="p-2">{mapaHojas.get(principal.hoja_id)}</td>
                  <td className="p-2 max-w-md">
                    <div className="line-clamp-2">
                      {Object.entries(principal.datos_snapshot)
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </div>
                    {principal.comentario && (
                      <div className="muted italic mt-1">"{principal.comentario}"</div>
                    )}
                  </td>
                  <td className="p-2">
                    <div>{u?.nombre || u?.email}</div>
                    <div className="muted text-[10px]">{u?.rol}</div>
                    {otros.length > 0 && (
                      <div className="muted text-[10px] mt-1">
                        + {otros.length} duplicada(s):{" "}
                        {otros
                          .map((o) => mapaUsuarios.get(o.usuario_id)?.nombre || "?")
                          .join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <select
                      value={principal.estado}
                      onChange={(e) =>
                        cambiarEstado(principal.id, e.target.value as EstadoSeleccion)
                      }
                      className="text-xs"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="en_gestion">En gestión</option>
                      <option value="gestionada">Gestionada</option>
                      <option value="cancelada">Cancelada</option>
                      <option value="no_disponible">No disponible</option>
                    </select>
                  </td>
                  <td className="p-2 muted">{fmtFecha(principal.confirmada_en)}</td>
                  <td className="p-2">
                    {esAdmin && (
                      <button
                        onClick={() => eliminar(principal.id)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
