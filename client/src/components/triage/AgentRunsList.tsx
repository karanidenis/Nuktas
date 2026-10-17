import { Box, VStack, Text, HStack, Badge, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AgentRun } from "../../types/triage";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function AgentRunsList({ clinicId, token }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";

  useEffect(() => {
    if (!clinicId || !token) return;
    fetch(`${base}/api/v1/clinics/${clinicId}/agent-runs?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .catch(() => setRuns([]));
    const id = setInterval(() => {
      fetch(`${base}/api/v1/clinics/${clinicId}/agent-runs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => setRuns(d.runs || []));
    }, 3000);
    return () => clearInterval(id);
  }, [clinicId, token, base]);

  return (
    <Box bg="white" border="2px solid" borderColor="#111" p={4} borderRadius="6px">
      <Text fontWeight="800" mb={3}>Agent runs</Text>
      <VStack align="start" spacing={2} maxH="260px" overflowY="auto" w="full">
        {runs.map((r) => (
          <HStack key={r.id} w="full">
            <Badge colorScheme={r.status === "awaiting_approval" ? "orange" : r.status === "failed" ? "red" : "gray"}>
              {r.status}
            </Badge>
            <Text fontSize="xs">{r.model || "—"}</Text>
            <Text fontSize="xs" color="gray.600" ml="auto">{new Date(r.started_at).toLocaleTimeString()}</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}
