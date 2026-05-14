"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Hoja, RolUsuario, FiltroPorFila, ModoVisualizacion } from "@/lib/types";

const ROLES: RolUsuario[] = ["admin", "analista", "crs", "ejecutivo"];

export default function ConfigurarHojaCliente({ hoja }: { hoja: Hoja }) {
  const router = useRouter();
  const [modo, setModo] = useState<ModoVisualizacion>(hoja.modo_visualizacion);
  const [rolesVisibles, setRolesVisibles] = useState<RolUsuario[]>(hoja.roles_visibles ?? ROLES);
  const [columnasPorRol, setColumnasPorRol] = useState<Record<string, RolUsuario[]>>(
    hoja.columnas_por_rol ?? {}
  );
  const [filtrosPorFila, setFiltrosPorFila] = useState<FiltroPorFila[]>(
    hoja.filtros_por_fila ?? []
  );
  const [permiteSeleccion, setPermiteSeleccion] = useState(hoja.permite_seleccion);
  const [activa, setActiva] = useState(hoja.activa);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleRolVisible(r: RolUsuario) {
    setRolesVisibles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  function toggleColumnaPorRol(col: string, rol: RolUsuario) {
    setColumnasPorRol((prev) => {
      const actuales = prev[col] ?? [...ROLES];
      const nuevos = actuales.includes(rol)
        ? actuales.filter((x) => x !== rol)
        : [...actuales, rol];
      // Si quedan los 4 roles, lo borramos del mapa (significa "todos")
      const todos = ROLES.every((r) => nuevos.includes(r));
      const next = { ...prev };
      if (todos) delete next[col];
      else next[col] = nuevos;
      return next;
    });
  }

  function columnaVisiblePara(col: string, rol: RolUsuario): boolean {
    const roles = columnasPorRol[col];
    if (!roles || roles.length === 0) return true; // todos
    return roles.includes(rol);
  }

  function agregarFiltroPorFila() {
    setFiltrosPorFila([...filtrosPorFila, { columna: "", aplicar_a: ["crs", "ejecutivo"] }]);
  }

  function actualizarFiltroPorFila(idx: number, cambios: Partial<FiltroPorFila>) {
    setFiltrosPorFila((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...cambios } : f))
    );
  }

  function quitarFiltroPorFila(idx: number) {
    setFiltrosPorFila((prev) => prev.filter((_, i) => i !== idx));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("hojas")
      .update({
        modo_visualizacion: modo,
        roles_visibles: rolesVisibles,
        columnas_por_rol: columnasPorRol,
        filtros_por_fila: filtrosPorFila.filter((f) => f.columna),
        permite_seleccion: permiteSeleccion,
        activa,
      })
      .eq("id", hoja.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMensaje("Configuración guardada.");
    setTimeout(() => router.refresh(), 600);
  }

  return (
    <div>
      <Link href={`/app/hojas/${hoja.id}`} className="muted text-xs hover:underline">
        ← {hoja.nombre}
      </Link>
      <h1 className="text-xl font-semibold mt-1 mb-1">Configurar hoja</h1>
      <p className="muted text-xs mb-4">
        Modifica los permisos y el modo de visualización. Los cambios aplican inmediatamente.
      </p>

      {error && (
        <div className="mb-3 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}
      {mensaje && (
        <div className="mb-3 text-xs px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded">
          {mensaje}
        </div>
      )}

      {/* MODO */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">Modo de visualización</p>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`border rounded p-3 cursor-pointer ${modo === "ver_todo" ? "border-blue-500 bg-blue-50" : "border-[rgb(var(--border))]"}`}
            style={{ borderWidth: modo === "ver_todo" ? 2 : 1 }}
          >
            <input
              type="radio"
              checked={modo === "ver_todo"}
              onChange={() => setModo("ver_todo")}
              className="mr-2"
            />
            <span className="text-sm font-medium">Ver todo al abrir</span>
            <p className="muted text-xs mt-1">Muestra todos los registros. Filtros opcionales para refinar.</p>
          </label>
          <label
            className={`border rounded p-3 cursor-pointer ${modo === "buscar_para_ver" ? "border-blue-500 bg-blue-50" : "border-[rgb(var(--border))]"}`}
            style={{ borderWidth: modo === "buscar_para_ver" ? 2 : 1 }}
          >
            <input
              type="radio"
              checked={modo === "buscar_para_ver"}
              onChange={() => setModo("buscar_para_ver")}
              className="mr-2"
            />
            <span className="text-sm font-medium">Buscar para ver</span>
            <p className="muted text-xs mt-1">Vista vacía hasta que el usuario aplique un filtro.</p>
          </label>
        </div>
      </div>

      {/* ROLES VISIBLES */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">¿Quién puede ver esta hoja?</p>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rolesVisibles.includes(r)}
                onChange={() => toggleRolVisible(r)}
                disabled={r === "admin"} // admin siempre ve todo
              />
              <span className={r === "admin" ? "muted" : ""}>{r} {r === "admin" && "(siempre)"}</span>
            </label>
          ))}
        </div>
      </div>

      {/* FILTROS POR FILA */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium">Filtro automático por fila</p>
          <button onClick={agregarFiltroPorFila} className="btn btn-ghost text-xs">+ Agregar</button>
        </div>
        <p className="muted text-xs mb-3">
          Cuando un usuario abra la hoja, solo verá filas donde el valor de la columna coincida con sus asignaciones (grupo de vendedor o zona).
        </p>
        {filtrosPorFila.length === 0 && (
          <p className="muted text-xs italic">Sin filtros configurados. Los usuarios ven todas las filas.</p>
        )}
        {filtrosPorFila.map((f, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <select
              value={f.columna}
              onChange={(e) => actualizarFiltroPorFila(i, { columna: e.target.value })}
              className="text-xs flex-1"
            >
              <option value="">— elegir columna —</option>
              {hoja.columnas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex gap-2 text-xs">
              {(["crs", "ejecutivo"] as RolUsuario[]).map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={f.aplicar_a.includes(r)}
                    onChange={() => {
                      const nuevos = f.aplicar_a.includes(r)
                        ? f.aplicar_a.filter((x) => x !== r)
                        : [...f.aplicar_a, r];
                      actualizarFiltroPorFila(i, { aplicar_a: nuevos });
                    }}
                  />
                  {r}
                </label>
              ))}
            </div>
            <button
              onClick={() => quitarFiltroPorFila(i)}
              className="text-xs text-red-600 hover:underline"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* COLUMNAS POR ROL */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">Columnas visibles por rol</p>
        <p className="muted text-xs mb-3">
          Desactiva los checkboxes para ocultar una columna a ese rol. Admin siempre ve todo.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-[rgb(var(--bg-alt))]">
              <tr>
                <th className="p-2 text-left">Columna</th>
                {ROLES.map((r) => (
                  <th key={r} className="p-2 text-center" style={{ width: 80 }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hoja.columnas.map((c) => (
                <tr key={c} className="border-t border-[rgb(var(--border))]">
                  <td className="p-2">{c}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={columnaVisiblePara(c, r)}
                        onChange={() => toggleColumnaPorRol(c, r)}
                        disabled={r === "admin"}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* OPCIONES GENERALES */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium mb-3">Opciones generales</p>
        <label className="flex items-center gap-2 mb-2 text-sm">
          <input
            type="checkbox"
            checked={permiteSeleccion}
            onChange={(e) => setPermiteSeleccion(e.target.checked)}
          />
          Permite que los usuarios seleccionen filas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
          />
          Hoja activa (visible en el listado)
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={`/app/hojas/${hoja.id}`} className="btn text-sm">Cancelar</Link>
        <button
          onClick={guardar}
          disabled={guardando}
          className="btn btn-primary text-sm"
        >
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
