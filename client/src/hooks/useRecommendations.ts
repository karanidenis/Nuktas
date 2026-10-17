import { useEffect, useState, useCallback } from "react";
import type { Recommendation, Approval } from "../types/triage";

export function useRecommendations(
  clinicId: string | undefined,
  token: string | null,
  statuses: string = "pending,awaiting_approval"
) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const fetchList = useCallback(async () => {
    if (!clinicId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${base}/api/v1/clinics/${clinicId}/recommendations?status=${statuses}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, token, statuses, base]);

  useEffect(() => {
    fetchList();
    const id = setInterval(fetchList, 4000);
    return () => clearInterval(id);
  }, [fetchList]);

  const approve = useCallback(
    async (id: string, note?: string) => {
      if (!clinicId || !token) throw new Error("Missing auth");
      const res = await fetch(`${base}/api/v1/clinics/${clinicId}/recommendations/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
      await fetchList();
      return res.json();
    },
    [clinicId, token, base, fetchList]
  );

  const reject = useCallback(
    async (id: string, note?: string) => {
      if (!clinicId || !token) throw new Error("Missing auth");
      const res = await fetch(`${base}/api/v1/clinics/${clinicId}/recommendations/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
      await fetchList();
      return res.json();
    },
    [clinicId, token, base, fetchList]
  );

  return { recommendations, loading, error, approve, reject, refresh: fetchList };
}
