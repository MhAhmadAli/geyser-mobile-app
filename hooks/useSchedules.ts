import { useCallback, useEffect, useMemo, useState } from "react";
import Toast from "react-native-toast-message";

export type ScheduleMode = "electric" | "gas";

export interface Schedule {
  id: string | number;
  scheduleId: number;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  days: number[]; // 0-6 (Sun..Sat)
  mode: ScheduleMode;
  setpoint: number; // target temperature
  enabled: boolean;
}

export interface UseSchedulesOptions {
  apiBaseUrl: string;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// --- Helper functions ---
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function getString(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fallback;
}
function getNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function getBooleanFrom(obj: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  }
  return fallback;
}
function getDays(obj: Record<string, unknown>, key = "days"): number[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .map((d) => (typeof d === "number" ? d : Number(d)))
    .filter((d): d is number => Number.isFinite(d) && d >= 0 && d <= 6);
}
function getMode(obj: Record<string, unknown>, key = "mode"): ScheduleMode {
  const v = obj[key];
  if (typeof v === "string") return v === "gas" ? "gas" : "electric";
  if (typeof v === "number") return v === 1 ? "gas" : "electric";
  return "electric";
}
function normalizeSchedule(input: unknown): Schedule {
  const obj = isRecord(input) ? input : {};
  const name = getString(obj, "name", "Untitled");
  const startTime = getString(obj, "startTime", "06:00");
  const endTime = getString(obj, "endTime", "07:00");
  const idRaw = obj["id"];
  const id = typeof idRaw === "string" || typeof idRaw === "number" ? idRaw : `${name}-${startTime}`;
  const scheduleId = getNumber(obj, "scheduleId", 0);

  return {
    id,
    scheduleId,
    name,
    startTime,
    endTime,
    days: getDays(obj),
    mode: getMode(obj),
    setpoint: getNumber(obj, "setpoint", 55),
    enabled: getBooleanFrom(obj, ["enabled", "active"], false),
  };
}

// --- Hook ---
export function useSchedules({ apiBaseUrl }: UseSchedulesOptions) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => `${apiBaseUrl.replace(/\/$/, "")}/schedule`, [apiBaseUrl]);

  const showError = (msg: string) => Toast.show({ type: "error", text1: msg });
  const showSuccess = (msg: string) => Toast.show({ type: "success", text1: msg });

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.items ?? [];
      setSchedules(list.map(normalizeSchedule));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load schedules";
      setError(msg);
      showError(`Failed to load schedules: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const createSchedule = useCallback(
    async (payload: Omit<Schedule, "id">) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = normalizeSchedule(await res.json());
        setSchedules((prev) => [...prev, created]);
        showSuccess("Schedule created");
        return created;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Create failed";
        showError(`Failed to create schedule: ${msg}`);
        throw e;
      }
    },
    [endpoint],
  );

  const updateSchedule = useCallback(
    async (id: Schedule["id"], updates: Partial<Omit<Schedule, "id">>) => {
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = normalizeSchedule(await res.json());
        setSchedules((prev) => prev.map((s) => (String(s.id) === String(id) ? updated : s)));
        showSuccess("Schedule updated");
        return updated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Update failed";
        showError(`Failed to update schedule: ${msg}`);
        throw e;
      }
    },
    [endpoint],
  );

  const deleteSchedule = useCallback(
    async (id: Schedule["id"]) => {
      try {
        const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSchedules((prev) => prev.filter((s) => String(s.id) !== String(id)));
        showSuccess("Schedule deleted");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        showError(`Failed to delete schedule: ${msg}`);
        throw e;
      }
    },
    [endpoint],
  );

  const toggleSchedule = useCallback(
    async (id: Schedule["id"], enabled: boolean) => {
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = normalizeSchedule(await res.json());
        setSchedules((prev) => prev.map((s) => (String(s.id) === String(id) ? updated : s)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Toggle failed";
        showError(`Failed to toggle schedule: ${msg}`);
        throw e;
      }
    },
    [endpoint],
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedules,
    loading,
    error,
    refetch: fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleSchedule,
  };
}
