import { Box, VStack, Text, HStack, Badge } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AuditEvent } from "../../types/triage";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function AuditLog({ clinicId, token }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const base = import.meta.env.VITE_API_URL || "";

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
    <Box bg="white" border="1px solid" borderColor="gray.200" p={5} borderRadius="xl" boxShadow="xs">
      <Text fontWeight="800">Audit log</Text><Text fontSize="xs" color="gray.500" mt={1} mb={4}>Named actors and governed actions</Text>
      <VStack align="start" spacing={0} maxH="420px" overflowY="auto" w="full">
        {events.map((ev) => (
          <HStack key={ev.id} w="full" align="start" py={2.5} borderTop="1px solid" borderColor="gray.100">
            <Badge size="sm" textTransform="none" bg="gray.100" color="gray.700">{ev.action.split("_").join(" ")}</Badge>
            <Text fontSize="xs" color="gray.600">{ev.actor_name || ev.actor_type}</Text>
            <Text fontSize="xs" ml="auto" color="gray.500">{new Date(ev.inserted_at).toLocaleTimeString()}</Text>
          </HStack>
        ))}
        {events.length === 0 && <Text fontSize="sm" color="gray.500">No audit activity recorded.</Text>}
      </VStack>
    </Box>
  );
}
