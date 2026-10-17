/**
 * Replaces the Phoenix channel hook with a Socket.IO equivalent.
 * The server events and payload shapes are identical so the dashboard components
 * don't need to change.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { QueueEntry, QueueStats } from "../types";

interface ChannelState {
  queue: QueueEntry[];
  stats: QueueStats | null;
  criticalAlerts: QueueEntry[];
  connected: boolean;
}

export function useClinicSocket(clinicId: string | undefined, token: string | null) {
  const socketRef = useRef<Socket | null>(null);

  const [state, setState] = useState<ChannelState>({
    queue: [],
    stats: null,
    criticalAlerts: [],
    connected: false,
  });

  useEffect(() => {
    if (!clinicId || !token) return;

    const socket = io(import.meta.env.VITE_API_URL || "http://localhost:4000", {
      auth: { token },
      // Vite proxies /socket.io → localhost:4000 locally.
      // In production, we connect directly to the server URL.
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState((s) => ({ ...s, connected: true }));
      // Request to join the clinic room after connecting
      socket.emit("join:clinic", { clinicId });
    });

    socket.on("disconnect", () => {
      setState((s) => ({ ...s, connected: false }));
    });

    socket.on("queue_state", (payload: { queue: QueueEntry[]; stats: QueueStats; critical_alerts: QueueEntry[] }) => {
      setState({
        queue: payload.queue,
        stats: payload.stats,
        criticalAlerts: payload.critical_alerts,
        connected: true,
      });
    });

    socket.on("patient_joined", (payload: { queue_entry: QueueEntry }) => {
      setState((s) => {
        const exists = s.queue.some((e) => e.id === payload.queue_entry.id);
        const updated = exists
          ? s.queue.map((e) => (e.id === payload.queue_entry.id ? payload.queue_entry : e))
          : [payload.queue_entry, ...s.queue];
        return { ...s, queue: updated };
      });
    });

    socket.on("status_update", (payload: { entry_id: string; status: string; queue_entry: QueueEntry }) => {
      setState((s) => ({
        ...s,
        queue: s.queue.map((e) =>
          e.id === payload.entry_id ? { ...e, ...payload.queue_entry } : e
        ),
      }));
    });

    socket.on("critical_alert", (payload: { queue_entry: QueueEntry }) => {
      setState((s) => ({
        ...s,
        criticalAlerts: [payload.queue_entry, ...s.criticalAlerts.filter((e) => e.id !== payload.queue_entry.id)],
      }));

      if (Notification.permission === "granted") {
        new Notification("🚨 CRITICAL PATIENT", {
          body: `${payload.queue_entry.patient?.name ?? "Unknown"} — ${payload.queue_entry.chief_complaint ?? "Critical"}`,
          tag: `critical-${payload.queue_entry.id}`,
          requireInteraction: true,
        });
      }
    });

    socket.on("alert_acknowledged", (payload: { entry_id: string }) => {
      setState((s) => ({
        ...s,
        criticalAlerts: s.criticalAlerts.filter((e) => e.id !== payload.entry_id),
      }));
    });

    socket.on("error", (err: { reason: string }) => {
      console.error("Socket error:", err.reason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [clinicId, token]);

  const acknowledgeAlert = useCallback((entryId: string) => {
    socketRef.current?.emit("acknowledge_alert", { entry_id: entryId });
  }, []);

  const checkIn = useCallback((entryId: string) => {
    socketRef.current?.emit("check_in", { entry_id: entryId });
  }, []);

  const updateStatus = useCallback((entryId: string, status: string) => {
    socketRef.current?.emit("update_status", { entry_id: entryId, status });
  }, []);

  return { ...state, acknowledgeAlert, checkIn, updateStatus };
}
