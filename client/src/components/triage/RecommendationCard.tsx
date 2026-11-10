import { Box, Button, Grid, HStack, Text, Textarea, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { UrgencyBadge } from "../UrgencyBadge";
import type { Recommendation } from "../../types/triage";

interface Props { recommendation: Recommendation; onApprove: (note?: string) => Promise<any>; onReject: (note?: string) => Promise<any>; }
export function RecommendationCard({ recommendation, onApprove, onReject }: Props) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const act = async (kind: "approve" | "reject") => { setBusy(true); try { await (kind === "approve" ? onApprove(note || "Reviewed and approved by triage clinician") : onReject(note || "Rejected by triage clinician")); } finally { setBusy(false); } };
  return <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" overflow="hidden" boxShadow="xs">
    <Grid templateColumns={{ base: "1fr", lg: "minmax(0,1fr) 260px" }}>
      <VStack p={5} align="stretch" spacing={4}>
        <HStack justify="space-between" align="flex-start"><Box><HStack><UrgencyBadge tier={recommendation.recommended_urgency} /><Text fontSize="xs" color="gray.500">SATS {recommendation.sats_colour} · target {recommendation.target_minutes ?? "—"} min</Text></HStack><Text mt={3} fontSize="lg" fontWeight="800">{recommendation.patient?.name ?? "Unknown patient"}</Text><Text fontSize="xs" color="gray.500">Queue {recommendation.queue_entry?.queue_number || "—"}</Text></Box><Text fontSize="xs" color="orange.700" bg="orange.50" borderRadius="full" px={3} py={1.5} fontWeight="700">Awaiting clinician</Text></HStack>
        <Box><Text fontSize="10px" color="gray.400" fontWeight="800" textTransform="uppercase" letterSpacing=".08em">Evidence and rationale</Text><Text mt={2} fontSize="sm" color="gray.700" lineHeight="1.65">{recommendation.rationale || "No rationale recorded."}</Text></Box>
        {recommendation.missing_data?.length ? <Box p={3} bg="yellow.50" borderRadius="lg"><Text fontSize="xs" fontWeight="750" color="yellow.800">Missing observations</Text><Text fontSize="xs" color="yellow.800" mt={1}>{recommendation.missing_data.join(", ")}</Text></Box> : null}
      </VStack>
      <VStack p={5} bg="gray.50" borderLeft={{ lg: "1px solid" }} borderTop={{ base: "1px solid", lg: "none" }} borderColor="gray.200" align="stretch" spacing={3}>
        <Box><Text fontWeight="800" fontSize="sm">Clinician decision</Text><Text fontSize="xs" color="gray.500" mt={1} lineHeight="1.5">Approval applies this recommendation to the queue and records your identity.</Text></Box>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} bg="white" size="sm" placeholder="Decision note (recommended)" resize="vertical" />
        <Button colorScheme="blue" isLoading={busy} onClick={() => act("approve")}>Approve & update queue</Button>
        <Button variant="outline" colorScheme="red" isDisabled={busy} onClick={() => act("reject")}>Reject recommendation</Button>
      </VStack>
    </Grid>
  </Box>;
}
