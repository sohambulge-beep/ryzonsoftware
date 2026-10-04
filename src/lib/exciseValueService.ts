import { listExciseBrands } from "@/lib/exciseService";
import { getMonthlyReturn } from "@/lib/exciseReturnService";

export interface ValueRow {
  brand_id: string;
  brand_name: string;
  category: string;
  size_ml: number;
  closing_qty: number;
  rate_paise: number;
  value_paise: number;
}

// Closing stock of the month x brand rate. Money is kept in paise (whole numbers).
// A negative closing stock is counted as 0 in the value so the total is not reduced.
export async function getStockValue(year: number, month: number): Promise<ValueRow[]> {
  const [returnRows, brands] = await Promise.all([
    getMonthlyReturn(year, month),
    listExciseBrands(),
  ]);

  const rateById = new Map<string, number>(
    brands.map((b) => [b.id, Math.round((Number(b.rate) || 0) * 100)])
  );

  return returnRows.map((r) => {
    const ratePaise = rateById.get(r.brand_id) ?? 0;
    const qty = Math.max(r.closing_qty, 0);
    return {
      brand_id: r.brand_id,
      brand_name: r.brand_name,
      category: r.category,
      size_ml: r.size_ml,
      closing_qty: r.closing_qty,
      rate_paise: ratePaise,
      value_paise: qty * ratePaise,
    };
  });
}
