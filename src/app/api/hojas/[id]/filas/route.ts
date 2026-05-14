import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const desde = parseInt(searchParams.get("desde") ?? "0", 10);
  const tamano = Math.min(
    parseInt(searchParams.get("tamano") ?? "2000", 10),
    5000
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filas")
    .select("id,hoja_id,datos,hash_dedupe,grupo_vendedor,razon_social,zona,snapshot_version")
    .eq("hoja_id", id)
    .range(desde, desde + tamano - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    filas: data ?? [],
    desde,
    tamano: data?.length ?? 0,
    completo: (data?.length ?? 0) < tamano,
  });
}
