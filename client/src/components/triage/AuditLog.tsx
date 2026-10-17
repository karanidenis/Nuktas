import { Box, VStack, Text, HStack, Badge } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AuditEvent } from "../../types/triage";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function AuditLog({ clinicId, token }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";

  useEffect(() => {
    if (!clinicId || !token) return;
    fetch(`${base}/api/v1/clinics/${clinicId}/audit?limit=40`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [clinicId, token, base]);

  return (
    <Box bg="white" border="2px solid" borderColor="#111" p={4} borderRadius="6px">
      <Text fontWeight="800" mb={3}>Audit log</Text>
      <VStack align="start" spacing={2} maxH="260px" overflowY="auto" w="full">
        {events.map((ev) => (
          <HStack key={ev.id} w="full" align="start">
            <Badge size="sm">{ev.action}</Badge>
            <Text fontSize="xs" color="gray.600">{ev.actor_name || ev.actor_type}</Text>
            <Text fontSize="xs" ml="auto" color="gray.500">{new Date(ev.inserted_at).toLocaleTimeString()}</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}
