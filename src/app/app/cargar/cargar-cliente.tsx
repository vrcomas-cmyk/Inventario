"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hashDedupe, normalizarCelda } from "@/lib/utils";
import type { MapeoConfig } from "@/lib/types";

type Plantilla = { id: string; nombre: string; config: MapeoConfig };

type Pestania = {
  nombre: string;
  columnas: string[];
  filas: Record<string, unknown>[];
};

export default function CargarCliente({ plantillas }: { plantillas: Plantilla[] }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pestanias, setPestanias] = useState<Pestania[]>([]);
  const [pestaniaSel, setPestaniaSel] = useState<string>("");
  const [nombreHoja, setNombreHoja] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [permiteSeleccion, setPermiteSeleccion] = useState(true);
  const [mapeo, setMapeo] = useState<MapeoConfig>({});
  const [plantillaSel, setPlantillaSel] = useState<string>("");
  const [reemplazaHojaId, setReemplazaHojaId] = useState<string>("");
  const [hojasExistentes, setHojasExistentes] = useState<{id:string;nombre:string}[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Cargar lista de hojas para opción "reemplazar"
  useState(() => {
    const supabase = createClient();
    supabase
      .from("hojas")
      .select("id,nombre")
      .order("nombre")
      .then(({ data }) => setHojasExistentes(data ?? []));
    return undefined;
  });

  async function leerArchivo(f: File) {
    setError(null);
    setArchivo(f);
    const XLSX = await import("xlsx");
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const peSt: Pestania[] = wb.SheetNames.map((sn) => {
      const ws = wb.Sheets[sn];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: null,
        raw: true,
      });
      const cols =
        json.length > 0 ? Object.keys(json[0] as object) : [];
      // Normalizar valores Date → ISO
      const filasNorm = json.map((r) => {
        const out: Record<string, unknown> = {};
        for (const k of cols) out[k] = normalizarCelda(r[k]);
        return out;
      });
      return { nombre: sn, columnas: cols, filas: filasNorm };
    });
    setPestanias(peSt);
    if (peSt[0]) {
      setPestaniaSel(peSt[0].nombre);
      setNombreHoja(f.name.replace(/\.[^.]+$/, "") + " - " + peSt[0].nombre);
    }
  }

  const pesActual = pestanias.find((p) => p.nombre === pestaniaSel);

  function aplicarPlantilla(id: string) {
    setPlantillaSel(id);
    if (!id) return;
    const pl = plantillas.find((x) => x.id === id);
    if (pl) setMapeo(pl.config);
  }

  async function publicar() {
    if (!pesActual) return;
    if (!nombreHoja.trim()) {
      setError("Pon un nombre a la hoja.");
      return;
    }
    setCargando(true);
    setError(null);
    setExito(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("No hay sesión.");
      setCargando(false);
      return;
    }

    try {
      // Si reemplaza, primero eliminar hoja anterior (cascade borra filas)
      let snapshotVersion = 1;
      if (reemplazaHojaId) {
        const { data: anterior } = await supabase
          .from("hojas")
          .select("snapshot_version")
          .eq("id", reemplazaHojaId)
          .single();
        if (anterior) snapshotVersion = (anterior.snapshot_version ?? 1) + 1;
        const { error: errDel } = await supabase
          .from("hojas")
          .delete()
          .eq("id", reemplazaHojaId);
        if (errDel) throw errDel;
      }

      // Insertar hoja
      const { data: hojaIns, error: errHoja } = await supabase
        .from("hojas")
        .insert({
          nombre: nombreHoja,
          descripcion: descripcion || null,
          mapeo: mapeo as object,
          columnas: pesActual.columnas,
          permite_seleccion: permiteSeleccion,
          plantilla_id: plantillaSel || null,
          subida_por: user.id,
          snapshot_version: snapshotVersion,
          activa: true,
        })
        .select("id")
        .single();
      if (errHoja) throw errHoja;

      const hojaId = hojaIns.id as string;

      // Determinar columnas para hash de deduplicación
      const clavesDedupe =
        mapeo.claves_dedupe && mapeo.claves_dedupe.length > 0
          ? mapeo.claves_dedupe
          : pesActual.columnas.slice(0, 3);

      // Insertar filas en lotes
      const LOTE = 500;
      const filasArr = pesActual.filas.map((datos) => ({
        hoja_id: hojaId,
        datos: datos as object,
        hash_dedupe: hashDedupe(clavesDedupe.map((c) => datos[c] as any)),
        grupo_vendedor: mapeo.grupo_vendedor
          ? String(datos[mapeo.grupo_vendedor] ?? "") || null
          : null,
        razon_social: mapeo.razon_social
          ? String(datos[mapeo.razon_social] ?? "") || null
          : null,
        zona: mapeo.zona ? String(datos[mapeo.zona] ?? "") || null : null,
        snapshot_version: snapshotVersion,
      }));

      for (let i = 0; i < filasArr.length; i += LOTE) {
        const lote = filasArr.slice(i, i + LOTE);
        const { error: errFilas } = await supabase.from("filas").insert(lote);
        if (errFilas) throw errFilas;
      }

      setExito(`Hoja publicada con ${filasArr.length} filas.`);
      setTimeout(() => router.push(`/app/hojas/${hojaId}`), 800);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Cargar archivo</h1>

      <div className="card p-5 mb-4">
        <label className="block text-sm font-medium mb-2">Archivo Excel (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
        />
        {archivo && (
          <p className="muted text-xs mt-2">
            {archivo.name} · {pestanias.length} pestaña(s) detectada(s)
          </p>
        )}
      </div>

      {pestanias.length > 0 && (
        <div className="card p-5 mb-4">
          <label className="block text-sm font-medium mb-2">Pestaña a publicar</label>
          <select
            value={pestaniaSel}
            onChange={(e) => setPestaniaSel(e.target.value)}
            className="w-full mb-4"
          >
            {pestanias.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre} ({p.filas.length} filas, {p.columnas.length} columnas)
              </option>
            ))}
          </select>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs muted mb-1">Nombre que verán los usuarios</label>
              <input
                type="text"
                value={nombreHoja}
                onChange={(e) => setNombreHoja(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs muted mb-1">Descripción (opcional)</label>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={permiteSeleccion}
                onChange={(e) => setPermiteSeleccion(e.target.checked)}
              />
              Permite que los usuarios seleccionen filas
            </label>
          </div>

          <div className="mb-3">
            <label className="block text-xs muted mb-1">Reemplazar hoja existente (opcional)</label>
            <select
              value={reemplazaHojaId}
              onChange={(e) => setReemplazaHojaId(e.target.value)}
              className="w-full"
            >
              <option value="">Crear nueva hoja</option>
              {hojasExistentes.map((h) => (
                <option key={h.id} value={h.id}>Reemplazar: {h.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {pesActual && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Mapeo de columnas</h3>
            <select
              value={plantillaSel}
              onChange={(e) => aplicarPlantilla(e.target.value)}
              className="text-xs"
            >
              <option value="">Aplicar plantilla…</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <p className="muted text-xs mb-3">
            Indica qué columna del archivo corresponde a cada campo lógico. Los que no se mapeen se ignoran para los filtros por rol pero las columnas siguen visibles en la tabla.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["grupo_vendedor", "Grupo de vendedor"],
              ["razon_social", "Razón social / Cliente"],
              ["zona", "Zona"],
              ["material", "Material / SKU"],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs muted mb-1">{label}</label>
                <select
                  value={(mapeo as any)[k] ?? ""}
                  onChange={(e) =>
                    setMapeo({ ...mapeo, [k]: e.target.value || null })
                  }
                  className="w-full"
                >
                  <option value="">— ninguna —</option>
                  {pesActual.columnas.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <label className="block text-xs muted mb-1">
              Columnas clave para deduplicar (ctrl+click para varias)
            </label>
            <select
              multiple
              value={mapeo.claves_dedupe ?? []}
              onChange={(e) =>
                setMapeo({
                  ...mapeo,
                  claves_dedupe: Array.from(e.target.selectedOptions).map((o) => o.value),
                })
              }
              className="w-full"
              size={Math.min(6, pesActual.columnas.length)}
            >
              {pesActual.columnas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="muted text-xs mt-1">
              Si no eliges, usaremos las primeras 3 columnas. Esto se usa para identificar selecciones cuando reemplazas datos.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[rgb(var(--border))]">
            <p className="text-xs muted mb-2">
              Columnas detectadas ({pesActual.columnas.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {pesActual.columnas.map((c) => (
                <span
                  key={c}
                  className="text-xs px-2 py-0.5 bg-[rgb(var(--bg-alt))] border border-[rgb(var(--border))] rounded"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {exito && <p className="text-green-700 text-sm mb-3">{exito}</p>}

      {pesActual && (
        <button onClick={publicar} disabled={cargando} className="btn btn-primary">
          {cargando ? "Publicando…" : "Confirmar y publicar"}
        </button>
      )}
    </div>
  );
}
