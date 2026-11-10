import { Box, VStack, Text, HStack, Badge, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AgentRun } from "../../types/triage";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function AgentRunsList({ clinicId, token }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const base = import.meta.env.VITE_API_URL || "";

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
    <Box bg="white" border="1px solid" borderColor="gray.200" p={5} borderRadius="xl" boxShadow="xs">
      <Text fontWeight="800">Agent runs</Text><Text fontSize="xs" color="gray.500" mt={1} mb={4}>Model execution and terminal state</Text>
      <VStack align="start" spacing={0} maxH="420px" overflowY="auto" w="full">
        {runs.map((r) => (
          <HStack key={r.id} w="full" py={2.5} borderTop="1px solid" borderColor="gray.100">
            <Badge colorScheme={r.status === "awaiting_approval" ? "orange" : r.status === "failed" ? "red" : "gray"}>
              {r.status}
            </Badge>
            <Text fontSize="xs">{r.model || "—"}</Text>
            <Text fontSize="xs" color="gray.600" ml="auto">{new Date(r.started_at).toLocaleTimeString()}</Text>
          </HStack>
        ))}
        {runs.length === 0 && <Text fontSize="sm" color="gray.500">No agent runs recorded.</Text>}
      </VStack>
    </Box>
  );
}
