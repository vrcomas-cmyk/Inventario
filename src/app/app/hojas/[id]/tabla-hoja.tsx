"use client";

import { useMemo, useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import {
  aplicaFiltroColumna,
  aplicaFiltroGlobal,
  valoresUnicosColumna,
} from "@/lib/filtros";
import { createClient } from "@/lib/supabase/client";
import type { Hoja, Fila, Seleccion } from "@/lib/types";

type Props = {
  hoja: Hoja;
  filas: Fila[];
  selecciones: Seleccion[];
  mapaUsuarios: Record<string, string>;
  miUsuarioId: string | null;
  miRol: string | null;
};

const FILA_ALTURA = 34; // px por fila — debe coincidir con padding+contenido
const OVERSCAN = 10; // filas extra arriba y abajo del viewport

export default function TablaHoja({
  hoja,
  filas,
  selecciones,
  mapaUsuarios,
  miUsuarioId,
  miRol,
}: Props) {
  const columnas = hoja.columnas ?? [];

  const [filtroGlobal, setFiltroGlobal] = useState("");
  const [filtrosCol, setFiltrosCol] = useState<Record<string, string>>({});
  const [ordenCol, setOrdenCol] = useState<string | null>(null);
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("asc");
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState("");
  const [enviando, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Dropdown de sugerencias abierto: columna y posición
  const [popoverCol, setPopoverCol] = useState<string | null>(null);

  // Virtualización: scroll offset y altura de viewport
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  useEffect(() => {
    function onResize() {
      if (scrollRef.current) {
        setViewportH(scrollRef.current.clientHeight);
      }
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mapa de hash_dedupe → selección activa
  const mapaSelecPorHash = useMemo(() => {
    const m = new Map<string, Seleccion[]>();
    for (const s of selecciones) {
      const arr = m.get(s.hash_dedupe) ?? [];
      arr.push(s);
      m.set(s.hash_dedupe, arr);
    }
    return m;
  }, [selecciones]);

  const filasFiltradas = useMemo(() => {
    let res = filas.filter((f) => {
      if (!aplicaFiltroGlobal(filtroGlobal, f.datos)) return false;
      for (const [col, val] of Object.entries(filtrosCol)) {
        if (!val) continue;
        if (!aplicaFiltroColumna(val, f.datos[col])) return false;
      }
      return true;
    });
    if (ordenCol) {
      const dir = ordenDir === "asc" ? 1 : -1;
      res = [...res].sort((a, b) => {
        const va = a.datos[ordenCol];
        const vb = b.datos[ordenCol];
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va ?? "").localeCompare(String(vb ?? ""), "es", { numeric: true }) * dir;
      });
    }
    return res;
  }, [filas, filtroGlobal, filtrosCol, ordenCol, ordenDir]);

  // Rango virtualizado
  const totalH = filasFiltradas.length * FILA_ALTURA;
  const startIdx = Math.max(0, Math.floor(scrollTop / FILA_ALTURA) - OVERSCAN);
  const endIdx = Math.min(
    filasFiltradas.length,
    Math.ceil((scrollTop + viewportH) / FILA_ALTURA) + OVERSCAN
  );
  const filasVisibles = filasFiltradas.slice(startIdx, endIdx);
  const offsetY = startIdx * FILA_ALTURA;

  function toggleFila(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrden(col: string) {
    if (ordenCol === col) {
      setOrdenDir(ordenDir === "asc" ? "desc" : "asc");
    } else {
      setOrdenCol(col);
      setOrdenDir("asc");
    }
  }

  function exportarExcel() {
    import("xlsx").then((XLSX) => {
      const datos = filasFiltradas.map((f) => f.datos);
      const ws = XLSX.utils.json_to_sheet(datos, { header: columnas });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31));
      XLSX.writeFile(wb, `${hoja.nombre}_filtrado.xlsx`);
    });
  }

  async function confirmarSeleccion() {
    if (seleccionadas.size === 0) return;
    if (!miUsuarioId) return;

    const filasSel = filas.filter((f) => seleccionadas.has(f.id));
    const supabase = createClient();
    startTransition(async () => {
      const rows = filasSel.map((f) => ({
        fila_id: f.id,
        hoja_id: hoja.id,
        usuario_id: miUsuarioId,
        datos_snapshot: f.datos,
        hash_dedupe: f.hash_dedupe,
        estado: "pendiente" as const,
        comentario: comentario || null,
      }));
      const { error } = await supabase.from("selecciones").insert(rows);
      if (error) {
        setMensaje(`Error: ${error.message}`);
      } else {
        setMensaje(`${rows.length} fila(s) confirmadas correctamente.`);
        setSeleccionadas(new Set());
        setComentario("");
        setTimeout(() => location.reload(), 1200);
      }
    });
  }

  const puedeSeleccionar =
    hoja.permite_seleccion &&
    miRol &&
    ["admin", "analista", "crs", "ejecutivo"].includes(miRol);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/app" className="muted text-xs hover:underline">← Hojas</Link>
          <h1 className="text-xl font-semibold mt-1">{hoja.nombre}</h1>
          <p className="muted text-xs mt-1">
            {filasFiltradas.length.toLocaleString()} de {filas.length.toLocaleString()} filas · v{hoja.snapshot_version}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={exportarExcel} className="btn">Exportar filtrado</button>
          {puedeSeleccionar && seleccionadas.size > 0 && (
            <>
              <input
                type="text"
                placeholder="Comentario (opcional)"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="text-xs"
                style={{ width: 180 }}
              />
              <button
                onClick={confirmarSeleccion}
                disabled={enviando}
                className="btn btn-primary"
              >
                {enviando ? "Enviando…" : `Confirmar (${seleccionadas.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {mensaje && (
        <div className="mb-3 text-xs px-3 py-2 bg-[rgb(var(--bg-alt))] border border-[rgb(var(--border))] rounded">
          {mensaje}
        </div>
      )}

      <div className="card mb-3 p-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder='Búsqueda global · "frase exacta" busca textual'
            value={filtroGlobal}
            onChange={(e) => setFiltroGlobal(e.target.value)}
            className="flex-1"
          />
          <button
            onClick={() => {
              setFiltroGlobal("");
              setFiltrosCol({});
            }}
            className="btn btn-ghost text-xs"
          >
            Limpiar todo
          </button>
        </div>
        <p className="muted text-xs">
          Por columna: <code>104000 105000</code> trae ambos (OR) · <code>(vacio)</code> filtra vacíos · <code>{`"frase exacta"`}</code> · <code>{`>100`}</code> · <code>{`100-500`}</code> rango · Click en ▾ para elegir valores
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="card overflow-auto relative"
        style={{ height: "calc(100vh - 260px)" }}
      >
        <table className="w-full text-xs border-collapse" style={{ tableLayout: "auto" }}>
          <thead className="sticky top-0 bg-[rgb(var(--bg-alt))] z-20">
            <tr>
              {puedeSeleccionar && (
                <th className="p-2 border-b border-[rgb(var(--border))]" style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={
                      filasFiltradas.length > 0 &&
                      filasFiltradas.every((f) => seleccionadas.has(f.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSeleccionadas(new Set(filasFiltradas.map((f) => f.id)));
                      } else {
                        setSeleccionadas(new Set());
                      }
                    }}
                  />
                </th>
              )}
              <th className="p-2 text-left border-b border-[rgb(var(--border))]" style={{ width: 130 }}>
                Estado
              </th>
              {columnas.map((c) => (
                <th
                  key={c}
                  onClick={() => toggleOrden(c)}
                  className="p-2 text-left border-b border-[rgb(var(--border))] font-medium cursor-pointer hover:bg-[rgb(var(--bg))] whitespace-nowrap"
                >
                  {c} {ordenCol === c && (ordenDir === "asc" ? "↑" : "↓")}
                </th>
              ))}
            </tr>
            <tr>
              {puedeSeleccionar && <th className="p-1 border-b border-[rgb(var(--border))]" />}
              <th className="p-1 border-b border-[rgb(var(--border))]" />
              {columnas.map((c) => (
                <th key={`f-${c}`} className="p-1 border-b border-[rgb(var(--border))] relative">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={filtrosCol[c] ?? ""}
                      onChange={(e) =>
                        setFiltrosCol((prev) => ({ ...prev, [c]: e.target.value }))
                      }
                      placeholder="filtrar…"
                      className="flex-1 text-xs"
                      style={{ padding: "3px 6px", minWidth: 60 }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopoverCol(popoverCol === c ? null : c);
                      }}
                      className="text-xs px-1 hover:bg-[rgb(var(--bg))] rounded"
                      title="Ver valores únicos"
                      style={{ lineHeight: 1 }}
                    >
                      ▾
                    </button>
                  </div>
                  {popoverCol === c && (
                    <PopoverValores
                      filas={filas}
                      columna={c}
                      filtroActual={filtrosCol[c] ?? ""}
                      onAplicar={(nuevo) => {
                        setFiltrosCol((prev) => ({ ...prev, [c]: nuevo }));
                        setPopoverCol(null);
                      }}
                      onCerrar={() => setPopoverCol(null)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
        </table>

        {/* Cuerpo virtualizado */}
        <div style={{ height: totalH, position: "relative" }}>
          <table
            className="w-full text-xs border-collapse"
            style={{
              tableLayout: "auto",
              position: "absolute",
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            <tbody>
              {filasVisibles.map((f) => {
                const selecExist = mapaSelecPorHash.get(f.hash_dedupe) ?? [];
                const selecPropia = selecExist.find((s) => s.usuario_id === miUsuarioId);
                const selecAjena = selecExist.find((s) => s.usuario_id !== miUsuarioId);
                const tomada = selecPropia || selecAjena;
                const marcada = seleccionadas.has(f.id);

                return (
                  <tr
                    key={f.id}
                    style={{ height: FILA_ALTURA }}
                    className={
                      marcada
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : selecPropia
                        ? "bg-green-50 dark:bg-green-950/20"
                        : selecAjena
                        ? "bg-amber-50 dark:bg-amber-950/20"
                        : ""
                    }
                  >
                    {puedeSeleccionar && (
                      <td className="p-2 border-b border-[rgb(var(--border))]" style={{ width: 32 }}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => toggleFila(f.id)}
                          disabled={!!tomada}
                        />
                      </td>
                    )}
                    <td className="p-2 border-b border-[rgb(var(--border))] text-xs" style={{ width: 130 }}>
                      {tomada ? (
                        <div>
                          <div className="font-medium">
                            {selecPropia ? "Tú · " : ""}
                            {tomada.estado.replace("_", " ")}
                          </div>
                          {selecAjena && (
                            <div className="muted text-[10px]">
                              {mapaUsuarios[selecAjena.usuario_id] ?? "Otro usuario"}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="muted">disponible</span>
                      )}
                    </td>
                    {columnas.map((c) => (
                      <td
                        key={c}
                        className="p-2 border-b border-[rgb(var(--border))] whitespace-nowrap"
                      >
                        {String(f.datos[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Popover con valores únicos de una columna y multi-selección estilo Excel */
function PopoverValores({
  filas,
  columna,
  filtroActual,
  onAplicar,
  onCerrar,
}: {
  filas: Fila[];
  columna: string;
  filtroActual: string;
  onAplicar: (nuevo: string) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const valores = useMemo(
    () => valoresUnicosColumna(filas, columna, 1000),
    [filas, columna]
  );

  const valoresFiltrados = useMemo(() => {
    if (!busqueda.trim()) return valores;
    const q = busqueda.toLowerCase();
    return valores.filter((v) => v.etiqueta.toLowerCase().includes(q));
  }, [valores, busqueda]);

  // Parse selección actual desde el filtro
  const seleccionInicial = useMemo(() => {
    const set = new Set<string>();
    const regex = /"[^"]*"|\S+/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(filtroActual)) !== null) {
      const t = m[0].replace(/^"|"$/g, "");
      set.add(t);
    }
    return set;
  }, [filtroActual]);

  const [seleccion, setSeleccion] = useState<Set<string>>(seleccionInicial);

  function toggle(v: string) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  }

  function aplicar() {
    if (seleccion.size === 0) {
      onAplicar("");
      return;
    }
    const term = Array.from(seleccion)
      .map((v) => {
        if (v === "(vacio)") return v;
        // Si contiene espacios, envolver en comillas
        if (/\s/.test(v)) return `"${v}"`;
        return v;
      })
      .join(" ");
    onAplicar(term);
  }

  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 card shadow-lg"
      style={{ width: 260, maxHeight: 340, display: "flex", flexDirection: "column" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-[rgb(var(--border))]">
        <input
          type="text"
          placeholder="Buscar valor…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full text-xs"
          autoFocus
        />
      </div>
      <div className="overflow-auto flex-1" style={{ maxHeight: 220 }}>
        {valoresFiltrados.length === 0 && (
          <p className="muted text-xs p-3 text-center">Sin valores</p>
        )}
        {valoresFiltrados.map((v) => (
          <label
            key={v.valor}
            className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[rgb(var(--bg-alt))] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={seleccion.has(v.valor)}
              onChange={() => toggle(v.valor)}
            />
            <span
              className={v.esVacio ? "italic muted" : ""}
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {v.etiqueta}
            </span>
            <span className="muted text-[10px]">{v.conteo}</span>
          </label>
        ))}
      </div>
      <div className="p-2 border-t border-[rgb(var(--border))] flex justify-between gap-2">
        <button
          onClick={() => {
            setSeleccion(new Set());
            onAplicar("");
          }}
          className="btn btn-ghost text-xs"
        >
          Limpiar
        </button>
        <div className="flex gap-1">
          <button onClick={onCerrar} className="btn btn-ghost text-xs">Cancelar</button>
          <button onClick={aplicar} className="btn btn-primary text-xs">
            Aplicar ({seleccion.size})
          </button>
        </div>
      </div>
    </div>
  );
}
