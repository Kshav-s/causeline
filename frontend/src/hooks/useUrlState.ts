import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Filter state lives in the URL so filtered views are shareable (DESIGN_SYSTEM §5.5). */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((k: string, d = "") => params.get(k) ?? d, [params]);
  const getAll = useCallback((k: string) => params.getAll(k), [params]);
  const set = useCallback(
    (patch: Record<string, string | string[] | null | undefined>, resetPage = true) => {
      setParams((prev) => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          n.delete(k);
          if (Array.isArray(v)) v.forEach((x) => n.append(k, x));
          else if (v !== null && v !== undefined && v !== "") n.set(k, v);
        }
        if (resetPage && !("page" in patch)) n.delete("page");
        return n;
      }, { replace: true });
    },
    [setParams],
  );
  return { params, get, getAll, set };
}
