import { Badge, Box, Button, Code, Collapse, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AgentRun } from "../../types/triage";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function AgentRunsList({ clinicId, token }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selected, setSelected] = useState<AgentRun | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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

  const openRun = async (run: AgentRun) => {
    if (selected?.id === run.id) return setSelected(null);
    if (!clinicId || !token) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`${base}/api/v1/clinics/${clinicId}/agent-runs/${run.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json(); setSelected(data.run || run);
    } finally { setDetailLoading(false); }
  };

  const stepLabel = (step: any) => step.kind === "borrowed_mcp" ? "Borrowed MCP" : step.kind === "guardrail" ? "Safety guardrail" : "Tool call";

  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" p={5} borderRadius="xl" boxShadow="xs">
      <Text fontWeight="800">Agent runs</Text><Text fontSize="xs" color="gray.500" mt={1} mb={4}>Model execution and terminal state</Text>
      <VStack align="start" spacing={0} maxH="620px" overflowY="auto" w="full">
        {runs.map((r) => (
          <Box key={r.id} w="full" borderTop="1px solid" borderColor="gray.100"><Button onClick={() => openRun(r)} variant="ghost" borderRadius={0} h="auto" py={2.5} px={0} w="full" justifyContent="stretch"><HStack w="full"><Badge colorScheme={r.status === "awaiting_approval" ? "orange" : r.status === "failed" ? "red" : r.status === "applied" ? "green" : "gray"}>{r.status}</Badge><Box textAlign="left"><Text fontSize="xs" fontWeight="700">{r.model || "Model pending"}</Text><Text fontSize="10px" color="gray.500">{r.step_count || 0} steps · {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "running"}</Text></Box><Text fontSize="xs" color="gray.600" ml="auto">{new Date(r.started_at).toLocaleTimeString()}</Text></HStack></Button><Collapse in={selected?.id === r.id} animateOpacity>{selected?.id === r.id && <VStack align="stretch" pb={4} spacing={2}>{detailLoading ? <Spinner size="sm" /> : <><Box bg="gray.50" p={3} borderRadius="lg"><HStack justify="space-between"><Text fontSize="xs" fontWeight="750">Run summary</Text><Text fontSize="10px" color="gray.500">{selected.tokens_in ?? 0} in / {selected.tokens_out ?? 0} out</Text></HStack><Text fontSize="xs" color="gray.600" mt={1}>{selected.summary || selected.error || "Run in progress…"}</Text></Box>{selected.steps?.map((step: any, index: number) => <Box key={`${step.ts || index}-${index}`} border="1px solid" borderColor={step.ok === false ? "red.200" : "gray.200"} borderRadius="lg" p={3}><HStack><Badge colorScheme={step.ok === false ? "red" : step.kind === "guardrail" ? "purple" : "blue"}>{stepLabel(step)}</Badge><Text fontSize="xs" fontWeight="750">{step.name}</Text><Text ml="auto" fontSize="10px" color="gray.500">{step.latency_ms != null ? `${step.latency_ms}ms` : new Date((step.ts || 0) * 1000).toLocaleTimeString()}</Text></HStack>{step.detail && <Text fontSize="xs" color="gray.600" mt={2}>{step.detail}</Text>}{step.error && <Text fontSize="xs" color="red.700" mt={2}>{step.error}</Text>}{step.args && <Code mt={2} p={2} fontSize="10px" whiteSpace="pre-wrap" w="full">{JSON.stringify(step.args, null, 2)}</Code>}{step.result && <Code mt={2} p={2} fontSize="10px" whiteSpace="pre-wrap" w="full" maxH="140px" overflow="auto">{JSON.stringify(step.result, null, 2)}</Code>}</Box>)}</>}</VStack>}</Collapse></Box>
        ))}
        {runs.length === 0 && <Text fontSize="sm" color="gray.500">No agent runs recorded.</Text>}
      </VStack>
    </Box>
  );
}
