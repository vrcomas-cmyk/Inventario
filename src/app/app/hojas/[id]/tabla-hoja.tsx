"use client";

import { useMemo, useState, useTransition, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Hoja, Fila, Seleccion } from "@/lib/types";

type Props = {
  hoja: Hoja;
  totalFilas: number;
  selecciones: Seleccion[];
  mapaUsuarios: Record<string, string>;
  miUsuarioId: string | null;
  miRol: string | null;
};

const FILA_ALTURA = 32;
const OVERSCAN = 10;
const TAMANO_PAGINA = 2000;
const ANCHO_MIN = 80;
const ANCHO_MAX = 280;
const ANCHO_CHECKBOX = 36;
const ANCHO_ESTADO = 130;

function calcularAnchoColumna(col: string, filas: Fila[], muestraTam = 200): number {
  const headerLen = col.length;
  const paso = Math.max(1, Math.floor(filas.length / muestraTam));
  let maxLen = headerLen;
  for (let i = 0; i < filas.length; i += paso) {
    const v = filas[i].datos[col];
    const len = String(v ?? "").length;
    if (len > maxLen) maxLen = len;
  }
  return Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, maxLen * 7 + 20));
}

export default function TablaHoja({
  hoja,
  totalFilas,
  selecciones,
  mapaUsuarios,
  miUsuarioId,
  miRol,
}: Props) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [columnasVisibles, setColumnasVisibles] = useState<string[]>(hoja.columnas);
  const [cargando, setCargando] = useState(false);
  const [totalFiltrado, setTotalFiltrado] = useState(0);
  const [requireFiltro, setRequireFiltro] = useState(hoja.modo_visualizacion === "buscar_para_ver");
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [filtroGlobal, setFiltroGlobal] = useState("");
  const [filtrosActivos, setFiltrosActivos] = useState<{ col: string; val: string }[]>([]);
  const [ordenCol, setOrdenCol] = useState<string | null>(null);
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("asc");
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState("");
  const [enviando, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [popoverCol, setPopoverCol] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function onResize() {
      if (scrollRef.current) setViewportH(scrollRef.current.clientHeight);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // === CARGA DESDE SERVIDOR ===
  const cargarFilas = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(`/api/hojas/${hoja.id}/filas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde: 0,
          tamano: TAMANO_PAGINA,
          filtros: filtrosActivos,
          filtroGlobal,
          ordenCol,
          ordenDir,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        setErrorCarga(err.error || `Error ${res.status}`);
        setCargando(false);
        return;
      }
      const json = await res.json();
      setFilas(json.filas ?? []);
      setColumnasVisibles(json.columnasVisibles ?? hoja.columnas);
      setTotalFiltrado(json.total ?? 0);
      setRequireFiltro(json.requireFiltro === true);
    } catch (e: any) {
      setErrorCarga(e.message || "Error de red");
    } finally {
      setCargando(false);
    }
  }, [hoja.id, hoja.columnas, filtrosActivos, filtroGlobal, ordenCol, ordenDir]);

  // Cargar al cambiar filtros (con debounce)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarFilas();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cargarFilas]);

  // Cargar más al hacer scroll cerca del final (pagination)
  const cargarMas = useCallback(async () => {
    if (cargando) return;
    if (filas.length >= totalFiltrado) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/hojas/${hoja.id}/filas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde: filas.length,
          tamano: TAMANO_PAGINA,
          filtros: filtrosActivos,
          filtroGlobal,
          ordenCol,
          ordenDir,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setFilas((prev) => [...prev, ...(json.filas ?? [])]);
    } catch {
      // silencioso, ya se mostrarán los que se tengan
    } finally {
      setCargando(false);
    }
  }, [cargando, filas.length, totalFiltrado, hoja.id, filtrosActivos, filtroGlobal, ordenCol, ordenDir]);

  // Detección de scroll para cargar más
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      const target = el!;
      setScrollTop(target.scrollTop);
      // Cuando estamos cerca del final, cargar siguiente página
      const cerca = target.scrollHeight - target.scrollTop - target.clientHeight < 400;
      if (cerca && filas.length < totalFiltrado && !cargando) {
        cargarMas();
      }
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [filas.length, totalFiltrado, cargando, cargarMas]);

  // === SELECCIONES POR HASH ===
  const mapaSelecPorHash = useMemo(() => {
    const m = new Map<string, Seleccion[]>();
    for (const s of selecciones) {
      const arr = m.get(s.hash_dedupe) ?? [];
      arr.push(s);
      m.set(s.hash_dedupe, arr);
    }
    return m;
  }, [selecciones]);

  // === ANCHOS DE COLUMNA ===
  const anchosCol = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of columnasVisibles) {
      mapa[c] = calcularAnchoColumna(c, filas);
    }
    return mapa;
  }, [columnasVisibles, filas.length > 0 ? filas[0]?.id : null]);

  // === VIRTUALIZACIÓN ===
  const totalH = filas.length * FILA_ALTURA;
  const startIdx = Math.max(0, Math.floor(scrollTop / FILA_ALTURA) - OVERSCAN);
  const endIdx = Math.min(
    filas.length,
    Math.ceil((scrollTop + viewportH) / FILA_ALTURA) + OVERSCAN
  );
  const filasVisibles = filas.slice(startIdx, endIdx);
  const offsetY = startIdx * FILA_ALTURA;

  function agregarFiltro(col: string) {
    if (filtrosActivos.some((f) => f.col === col)) return;
    setFiltrosActivos([...filtrosActivos, { col, val: "" }]);
    setMostrarSelector(false);
  }

  function actualizarFiltro(col: string, val: string) {
    setFiltrosActivos((prev) => prev.map((f) => (f.col === col ? { ...f, val } : f)));
  }

  function quitarFiltro(col: string) {
    setFiltrosActivos((prev) => prev.filter((f) => f.col !== col));
    if (popoverCol === col) setPopoverCol(null);
  }

  function toggleFila(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrden(col: string) {
    if (ordenCol === col) setOrdenDir(ordenDir === "asc" ? "desc" : "asc");
    else {
      setOrdenCol(col);
      setOrdenDir("asc");
    }
  }

  function exportarExcel() {
    import("xlsx").then((XLSX) => {
      const datos = filas.map((f) => {
        const out: Record<string, unknown> = {};
        for (const c of columnasVisibles) out[c] = f.datos[c];
        return out;
      });
      const ws = XLSX.utils.json_to_sheet(datos, { header: columnasVisibles });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31));
      XLSX.writeFile(wb, `${hoja.nombre}_filtrado.xlsx`);
    });
  }

  async function confirmarSeleccion() {
    if (seleccionadas.size === 0 || !miUsuarioId) return;
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
      if (error) setMensaje(`Error: ${error.message}`);
      else {
        setMensaje(`${rows.length} fila(s) confirmadas.`);
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

  const esAdmin = miRol === "admin";

  const columnasDisponibles = columnasVisibles.filter(
    (c) => !filtrosActivos.some((f) => f.col === c)
  );

  const anchoTotal =
    (puedeSeleccionar ? ANCHO_CHECKBOX : 0) +
    ANCHO_ESTADO +
    columnasVisibles.reduce((s, c) => s + (anchosCol[c] ?? ANCHO_MIN), 0);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/app" className="muted text-xs hover:underline">← Hojas</Link>
          <h1 className="text-lg font-semibold mt-1">{hoja.nombre}</h1>
          <p className="muted text-xs mt-1">
            {requireFiltro ? (
              <>Modo: buscar para ver · {totalFilas.toLocaleString()} filas totales</>
            ) : (
              <>
                {totalFiltrado.toLocaleString()} resultados ({filas.length.toLocaleString()} cargadas)
                {" · "}v{hoja.snapshot_version}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {esAdmin && (
            <Link href={`/app/hojas/${hoja.id}/configurar`} className="btn text-xs">
              Configurar
            </Link>
          )}
          <button
            onClick={exportarExcel}
            className="btn text-xs"
            disabled={filas.length === 0}
          >
            Exportar
          </button>
          {puedeSeleccionar && seleccionadas.size > 0 && (
            <>
              <input
                type="text"
                placeholder="Comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="text-xs"
                style={{ width: 160 }}
              />
              <button
                onClick={confirmarSeleccion}
                disabled={enviando}
                className="btn btn-primary text-xs"
              >
                {enviando ? "…" : `Confirmar (${seleccionadas.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {errorCarga && (
        <div className="mb-3 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded">
          {errorCarga}
        </div>
      )}
      {mensaje && (
        <div className="mb-3 text-xs px-3 py-2 bg-[rgb(var(--bg-alt))] border border-[rgb(var(--border))] rounded">
          {mensaje}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "240px 1fr" }}>
        {/* PANEL LATERAL */}
        <aside className="card p-3" style={{ height: "calc(100vh - 200px)", overflowY: "auto" }}>
          <p className="text-[10px] uppercase tracking-wide muted mb-2 font-medium">
            Búsqueda global
          </p>
          <input
            type="text"
            placeholder="palabras o frase"
            value={filtroGlobal}
            onChange={(e) => setFiltroGlobal(e.target.value)}
            className="w-full text-xs mb-3"
          />

          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wide muted font-medium">
              Filtros por columna ({filtrosActivos.length})
            </p>
            {filtrosActivos.length > 0 && (
              <button
                onClick={() => setFiltrosActivos([])}
                className="text-[10px] muted hover:underline"
              >
                limpiar
              </button>
            )}
          </div>

          {filtrosActivos.length === 0 && (
            <p className="text-[11px] muted italic mb-2">
              Sin filtros activos. Agrega uno abajo.
            </p>
          )}

          {filtrosActivos.map(({ col, val }) => (
            <div key={col} className="mb-3 relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate" title={col}>{col}</span>
                <button
                  onClick={() => quitarFiltro(col)}
                  className="text-xs muted hover:text-red-600 px-1"
                  title="Quitar filtro"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="valor o valores"
                  value={val}
                  onChange={(e) => actualizarFiltro(col, e.target.value)}
                  className="flex-1 text-xs"
                  style={{ minWidth: 0 }}
                />
                <button
                  onClick={() => setPopoverCol(popoverCol === col ? null : col)}
                  className="btn btn-ghost text-xs"
                  style={{ padding: "4px 6px", lineHeight: 1 }}
                  title="Ver valores únicos (muestra)"
                >
                  ▾
                </button>
              </div>
              {popoverCol === col && (
                <PopoverValores
                  filas={filas}
                  columna={col}
                  filtroActual={val}
                  onAplicar={(nuevo) => {
                    actualizarFiltro(col, nuevo);
                    setPopoverCol(null);
                  }}
                  onCerrar={() => setPopoverCol(null)}
                />
              )}
            </div>
          ))}

          {mostrarSelector ? (
            <div className="border border-[rgb(var(--border))] rounded p-2 bg-[rgb(var(--bg-alt))]">
              <p className="text-[10px] muted mb-1">Elige columna:</p>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {columnasDisponibles.map((c) => (
                  <button
                    key={c}
                    onClick={() => agregarFiltro(c)}
                    className="block w-full text-left text-xs px-2 py-1 hover:bg-[rgb(var(--bg))] rounded"
                  >
                    {c}
                  </button>
                ))}
                {columnasDisponibles.length === 0 && (
                  <p className="text-[11px] muted italic px-2">No hay columnas para agregar.</p>
                )}
              </div>
              <button
                onClick={() => setMostrarSelector(false)}
                className="text-[10px] muted hover:underline mt-1"
              >
                cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarSelector(true)}
              className="w-full text-xs py-2 border border-dashed border-[rgb(var(--border))] rounded hover:bg-[rgb(var(--bg-alt))] muted"
              disabled={columnasDisponibles.length === 0}
            >
              + Agregar filtro
            </button>
          )}

          <div className="mt-4 pt-3 border-t border-[rgb(var(--border))]">
            <p className="text-[10px] muted leading-relaxed">
              <strong className="text-[rgb(var(--fg))]">Sintaxis:</strong><br />
              <code>104 105</code> = 104 ó 105<br />
              <code>(vacio)</code> = vacíos<br />
              <code>{`"frase exacta"`}</code><br />
              <code>{`>100`}</code> · <code>100-500</code>
            </p>
          </div>
        </aside>

        {/* TABLA */}
        <div
          ref={scrollRef}
          className="card overflow-auto relative"
          style={{ height: "calc(100vh - 200px)" }}
        >
          {requireFiltro && filas.length === 0 && !cargando && (
            <div className="p-12 text-center">
              <p className="text-base font-medium mb-1">Aplica un filtro para ver datos</p>
              <p className="muted text-xs">
                Esta hoja tiene {totalFilas.toLocaleString()} filas. Usa el panel de la izquierda para filtrar lo que necesitas.
              </p>
            </div>
          )}

          {!requireFiltro && filas.length === 0 && !cargando && totalFiltrado === 0 && (
            <div className="p-12 text-center muted text-xs">
              {filtrosActivos.length > 0 || filtroGlobal ? "Ningún resultado con los filtros actuales." : "Sin datos en esta hoja."}
            </div>
          )}

          {cargando && filas.length === 0 && (
            <div className="p-12 text-center muted text-xs">Cargando…</div>
          )}

          {filas.length > 0 && (
            <div style={{ width: anchoTotal, position: "relative" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  background: "rgb(var(--bg-alt))",
                  display: "flex",
                  borderBottom: "1px solid rgb(var(--border))",
                  height: FILA_ALTURA,
                  width: anchoTotal,
                }}
              >
                {puedeSeleccionar && (
                  <div
                    style={{
                      width: ANCHO_CHECKBOX,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRight: "0.5px solid rgb(var(--border))",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        filas.length > 0 && filas.every((f) => seleccionadas.has(f.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) setSeleccionadas(new Set(filas.map((f) => f.id)));
                        else setSeleccionadas(new Set());
                      }}
                    />
                  </div>
                )}
                <div
                  style={{
                    width: ANCHO_ESTADO,
                    flexShrink: 0,
                    padding: "8px",
                    fontWeight: 500,
                    fontSize: 12,
                    borderRight: "0.5px solid rgb(var(--border))",
                  }}
                >
                  Estado
                </div>
                {columnasVisibles.map((c) => (
                  <div
                    key={c}
                    onClick={() => toggleOrden(c)}
                    style={{
                      width: anchosCol[c] ?? ANCHO_MIN,
                      flexShrink: 0,
                      padding: "8px",
                      fontWeight: 500,
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderRight: "0.5px solid rgb(var(--border))",
                      userSelect: "none",
                    }}
                    title={c}
                  >
                    {c} {ordenCol === c && (ordenDir === "asc" ? "↑" : "↓")}
                  </div>
                ))}
              </div>

              <div style={{ height: totalH, position: "relative" }}>
                <div style={{ position: "absolute", top: offsetY, left: 0, width: anchoTotal }}>
                  {filasVisibles.map((f) => {
                    const selecExist = mapaSelecPorHash.get(f.hash_dedupe) ?? [];
                    const selecPropia = selecExist.find((s) => s.usuario_id === miUsuarioId);
                    const selecAjena = selecExist.find((s) => s.usuario_id !== miUsuarioId);
                    const tomada = selecPropia || selecAjena;
                    const marcada = seleccionadas.has(f.id);

                    const bg = marcada
                      ? "rgba(59,130,246,0.12)"
                      : selecPropia
                      ? "rgba(34,197,94,0.10)"
                      : selecAjena
                      ? "rgba(245,158,11,0.10)"
                      : "transparent";

                    return (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          height: FILA_ALTURA,
                          background: bg,
                          borderBottom: "0.5px solid rgb(var(--border))",
                          width: anchoTotal,
                        }}
                      >
                        {puedeSeleccionar && (
                          <div
                            style={{
                              width: ANCHO_CHECKBOX,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={() => toggleFila(f.id)}
                              disabled={!!tomada}
                            />
                          </div>
                        )}
                        <div
                          style={{
                            width: ANCHO_ESTADO,
                            flexShrink: 0,
                            padding: "6px 8px",
                            fontSize: 11,
                            overflow: "hidden",
                          }}
                        >
                          {tomada ? (
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 11 }}>
                                {selecPropia ? "Tú · " : ""}
                                {tomada.estado.replace("_", " ")}
                              </div>
                              {selecAjena && (
                                <div className="muted" style={{ fontSize: 10 }}>
                                  {mapaUsuarios[selecAjena.usuario_id] ?? "Otro"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="muted">disponible</span>
                          )}
                        </div>
                        {columnasVisibles.map((c) => (
                          <div
                            key={c}
                            style={{
                              width: anchosCol[c] ?? ANCHO_MIN,
                              flexShrink: 0,
                              padding: "6px 8px",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={String(f.datos[c] ?? "")}
                          >
                            {String(f.datos[c] ?? "")}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {cargando && filas.length > 0 && (
                <div className="text-center text-xs muted py-2 sticky bottom-0 bg-[rgb(var(--bg))]">
                  Cargando más…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Popover de valores únicos (muestra de las filas cargadas) */
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
  const valores = useMemo(() => {
    const conteos = new Map<string, number>();
    let vacios = 0;
    for (const f of filas) {
      const v = f.datos[columna];
      if (v === null || v === undefined || String(v).trim() === "") {
        vacios++;
        continue;
      }
      const k = String(v);
      conteos.set(k, (conteos.get(k) ?? 0) + 1);
    }
    const arr: { valor: string; etiqueta: string; conteo: number; esVacio: boolean }[] = [];
    if (vacios > 0) arr.push({ valor: "(vacio)", etiqueta: "(vacíos)", conteo: vacios, esVacio: true });
    for (const [k, c] of conteos) arr.push({ valor: k, etiqueta: k, conteo: c, esVacio: false });
    arr.sort((a, b) => {
      if (a.esVacio && !b.esVacio) return -1;
      if (!a.esVacio && b.esVacio) return 1;
      return a.valor.localeCompare(b.valor, "es", { numeric: true });
    });
    return arr.slice(0, 1000);
  }, [filas, columna]);

  const valoresFiltrados = useMemo(() => {
    if (!busqueda.trim()) return valores;
    const q = busqueda.toLowerCase();
    return valores.filter((v) => v.etiqueta.toLowerCase().includes(q));
  }, [valores, busqueda]);

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
        if (/\s/.test(v)) return `"${v}"`;
        return v;
      })
      .join(" ");
    onAplicar(term);
  }

  function seleccionarVisibles() {
    setSeleccion(new Set(valoresFiltrados.map((v) => v.valor)));
  }

  return (
    <div
      className="absolute left-0 right-0 top-full mt-1 z-50 card shadow-lg"
      style={{ maxHeight: 360, display: "flex", flexDirection: "column" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-[rgb(var(--border))]">
        <p className="text-[10px] muted mb-1">Valores únicos en los resultados actuales:</p>
        <input
          type="text"
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full text-xs"
          autoFocus
        />
        <div className="flex justify-between mt-1">
          <button onClick={seleccionarVisibles} className="text-[10px] muted hover:underline">
            seleccionar visibles ({valoresFiltrados.length})
          </button>
          <button onClick={() => setSeleccion(new Set())} className="text-[10px] muted hover:underline">
            limpiar
          </button>
        </div>
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
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={v.etiqueta}
            >
              {v.etiqueta}
            </span>
            <span className="muted text-[10px]">{v.conteo}</span>
          </label>
        ))}
      </div>
      <div className="p-2 border-t border-[rgb(var(--border))] flex justify-between gap-2">
        <button onClick={onCerrar} className="btn btn-ghost text-xs">Cancelar</button>
        <button onClick={aplicar} className="btn btn-primary text-xs">
          Aplicar ({seleccion.size})
        </button>
      </div>
    </div>
  );
}
