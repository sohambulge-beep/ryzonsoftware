import { supabase } from "@/integrations/supabase/client";

export const EXCISE_CATEGORIES = ["IMFL", "MML", "Wine", "Ferm Beer", "Mild Beer"] as const;
export type ExciseCategory = (typeof EXCISE_CATEGORIES)[number];

export interface ExciseSettings {
  id?: string;
  hotel_name: string;
  licence_no: string;
  flr2_no: string;
  permit_holder_no: string;
}

export interface ExciseBrand {
  id: string;
  name: string;
  category: ExciseCategory;
  size_ml: number;
  bottles_per_case: number;
  rate: number;
}

// New tables are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export async function getExciseSettings(): Promise<ExciseSettings> {
  const { data, error } = await db.from("excise_settings").select("*").maybeSingle();
  if (error) throw error;
  return data ?? { hotel_name: "", licence_no: "", flr2_no: "", permit_holder_no: "" };
}

export async function saveExciseSettings(s: ExciseSettings) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const { error } = await db.from("excise_settings").upsert(
    {
      user_id: auth.user.id,
      hotel_name: s.hotel_name,
      licence_no: s.licence_no,
      flr2_no: s.flr2_no,
      permit_holder_no: s.permit_holder_no,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function listExciseBrands(): Promise<ExciseBrand[]> {
  const { data, error } = await db
    .from("excise_brands")
    .select("*")
    .order("category")
    .order("name")
    .order("size_ml");
  if (error) throw error;
  return data ?? [];
}

export async function addExciseBrand(b: Omit<ExciseBrand, "id">) {
  const { error } = await db.from("excise_brands").insert(b);
  if (error) throw error;
}

export async function updateExciseBrand(id: string, b: Partial<Omit<ExciseBrand, "id">>) {
  const { error } = await db.from("excise_brands").update(b).eq("id", id);
  if (error) throw error;
}

export async function deleteExciseBrand(id: string) {
  const { error } = await db.from("excise_brands").delete().eq("id", id);
  if (error) throw error;
    }
