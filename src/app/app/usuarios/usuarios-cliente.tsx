"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Usuario, RolUsuario } from "@/lib/types";

type Asignacion = {
  id: string;
  usuario_id: string;
  grupo_vendedor: string | null;
  zona: string | null;
  es_zona_extra: boolean;
};

export default function UsuariosCliente({
  usuarios,
  asignaciones,
}: {
  usuarios: Usuario[];
  asignaciones: Asignacion[];
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const supabase = createClient();

  async function cambiarRol(id: string, rol: RolUsuario) {
    await supabase.from("usuarios").update({ rol }).eq("id", id);
    router.refresh();
  }

  async function toggleActivo(id: string, activo: boolean) {
    await supabase.from("usuarios").update({ activo: !activo }).eq("id", id);
    router.refresh();
  }

  async function agregarAsignacion(
    usuarioId: string,
    grupo: string,
    zona: string,
    extra: boolean
  ) {
    await supabase.from("asignaciones").insert({
      usuario_id: usuarioId,
      grupo_vendedor: grupo || null,
      zona: zona || null,
      es_zona_extra: extra,
    });
    router.refresh();
  }

  async function quitarAsignacion(id: string) {
    await supabase.from("asignaciones").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Usuarios</h1>
      <p className="muted text-sm mb-4">
        Los usuarios se crean automáticamente cuando inician sesión por primera vez con Google. Aquí asignas su rol y zonas.
      </p>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--bg-alt))]">
            <tr>
              <th className="p-3 text-left font-medium">Usuario</th>
              <th className="p-3 text-left font-medium">Rol</th>
              <th className="p-3 text-left font-medium">Asignaciones</th>
              <th className="p-3 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const misAsig = asignaciones.filter((a) => a.usuario_id === u.id);
              return (
                <UsuarioRow
                  key={u.id}
                  usuario={u}
                  asignaciones={misAsig}
                  expandido={editandoId === u.id}
                  onToggle={() => setEditandoId(editandoId === u.id ? null : u.id)}
                  onCambiarRol={(rol) => cambiarRol(u.id, rol)}
                  onToggleActivo={() => toggleActivo(u.id, u.activo)}
                  onAgregar={(g, z, e) => agregarAsignacion(u.id, g, z, e)}
                  onQuitar={(id) => quitarAsignacion(id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsuarioRow({
  usuario,
  asignaciones,
  expandido,
  onToggle,
  onCambiarRol,
  onToggleActivo,
  onAgregar,
  onQuitar,
}: {
  usuario: Usuario;
  asignaciones: Asignacion[];
  expandido: boolean;
  onToggle: () => void;
  onCambiarRol: (r: RolUsuario) => void;
  onToggleActivo: () => void;
  onAgregar: (grupo: string, zona: string, extra: boolean) => void;
  onQuitar: (id: string) => void;
}) {
  const [grupo, setGrupo] = useState("");
  const [zona, setZona] = useState("");
  const [extra, setExtra] = useState(false);

  return (
    <>
      <tr className="border-t border-[rgb(var(--border))]">
        <td className="p-3">
          <div className="font-medium">{usuario.nombre || usuario.email}</div>
          <div className="muted text-xs">{usuario.email}</div>
        </td>
        <td className="p-3">
          <select
            value={usuario.rol}
            onChange={(e) => onCambiarRol(e.target.value as RolUsuario)}
          >
            <option value="admin">admin</option>
            <option value="analista">analista</option>
            <option value="crs">crs</option>
            <option value="ejecutivo">ejecutivo</option>
          </select>
        </td>
        <td className="p-3">
          <button onClick={onToggle} className="btn btn-ghost text-xs">
            {asignaciones.length} asignación(es) {expandido ? "▴" : "▾"}
          </button>
        </td>
        <td className="p-3">
          <button onClick={onToggleActivo} className="btn btn-ghost text-xs">
            {usuario.activo ? "Activo" : "Inactivo"}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr className="bg-[rgb(var(--bg-alt))]">
          <td colSpan={4} className="p-4">
            <div className="space-y-2 mb-3">
              {asignaciones.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 text-xs px-2 py-1 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded"
                >
                  <span>Grupo: <strong>{a.grupo_vendedor || "—"}</strong></span>
                  <span>Zona: <strong>{a.zona || "—"}</strong></span>
                  {a.es_zona_extra && <span className="muted">(extra)</span>}
                  <button
                    onClick={() => onQuitar(a.id)}
                    className="ml-auto text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              {asignaciones.length === 0 && (
                <p className="muted text-xs">Sin asignaciones todavía.</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Grupo vendedor"
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                className="text-xs"
              />
              <input
                type="text"
                placeholder="Zona"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                className="text-xs"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={extra}
                  onChange={(e) => setExtra(e.target.checked)}
                />
                Zona extra (CRS)
              </label>
              <button
                onClick={() => {
                  if (!grupo && !zona) return;
                  onAgregar(grupo, zona, extra);
                  setGrupo("");
                  setZona("");
                  setExtra(false);
                }}
                className="btn btn-primary text-xs"
              >
                Agregar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
