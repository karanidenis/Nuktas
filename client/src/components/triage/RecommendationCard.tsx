import { Badge, Box, Button, FormControl, FormLabel, Grid, HStack, Select, Text, Textarea, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { UrgencyBadge } from "../UrgencyBadge";
import type { ClinicianDecisionInput, Recommendation, TriageUrgency } from "../../types/triage";

interface Props { recommendation: Recommendation; onApprove: (decision: ClinicianDecisionInput) => Promise<any>; onReject: (decision: ClinicianDecisionInput) => Promise<any>; }
export function RecommendationCard({ recommendation, onApprove, onReject }: Props) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [urgency, setUrgency] = useState<TriageUrgency>(recommendation.recommended_urgency);
  const [reason, setReason] = useState("agrees_with_recommendation");
  const act = async (kind: "approve" | "reject") => { setBusy(true); try { const decisionReason = kind === "reject" && reason === "agrees_with_recommendation" ? "insufficient_evidence" : reason; const decision = { clinician_urgency: urgency, decision_reason: decisionReason, note: note || (kind === "approve" ? "Reviewed and approved by triage clinician" : "Recommendation rejected pending clinician reassessment") }; await (kind === "approve" ? onApprove(decision) : onReject(decision)); } finally { setBusy(false); } };
  return <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" overflow="hidden" boxShadow="xs">
    <Grid templateColumns={{ base: "1fr", lg: "minmax(0,1fr) 310px" }}>
      <VStack p={5} align="stretch" spacing={4}>
        <HStack justify="space-between" align="flex-start"><Box><HStack><UrgencyBadge tier={recommendation.recommended_urgency} /><Text fontSize="xs" color="gray.500">SATS {recommendation.sats_colour} · target {recommendation.target_minutes ?? "—"} min</Text></HStack><Text mt={3} fontSize="lg" fontWeight="800">{recommendation.patient?.name ?? "Unknown patient"}</Text><Text fontSize="xs" color="gray.500">Queue {recommendation.queue_entry?.queue_number || "—"}</Text></Box><Text fontSize="xs" color="orange.700" bg="orange.50" borderRadius="full" px={3} py={1.5} fontWeight="700">Awaiting clinician</Text></HStack>
        <Box><Text fontSize="xs" color="gray.600" fontWeight="800" textTransform="uppercase" letterSpacing=".06em">Evidence and rationale</Text><Text mt={2} fontSize="sm" color="gray.800" lineHeight="1.65">{recommendation.rationale || "No rationale recorded."}</Text></Box>
        {recommendation.tews_breakdown?.length ? <Box><HStack justify="space-between" mb={2}><Text fontSize="xs" color="gray.600" fontWeight="800" textTransform="uppercase">Observed measurements</Text><Text fontSize="xs" color="gray.600">TEWS {recommendation.tews_score ?? "—"}</Text></HStack><Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }} gap={2}>{recommendation.tews_breakdown.map((item) => <Box key={item.vital} p={3} border="1px solid" borderColor={item.points >= 2 ? "orange.200" : "gray.200"} bg={item.points >= 2 ? "orange.50" : "gray.50"} borderRadius="lg"><Text fontSize="xs" color="gray.600" textTransform="capitalize">{String(item.vital).replaceAll("_", " ")}</Text><Text mt={1} fontWeight="850">{String(item.value)}</Text><Badge mt={1} colorScheme={item.points >= 2 ? "orange" : "gray"}>{item.points} point{item.points === 1 ? "" : "s"}</Badge></Box>)}</Grid></Box> : null}
        {recommendation.clinical_signs?.length ? <Box p={3} bg="red.50" borderRadius="lg"><Text fontSize="xs" fontWeight="800" color="red.800">Clinical signals</Text>{recommendation.clinical_signs.map((sign) => <Text key={sign.code || sign.label} fontSize="sm" color="red.800" mt={1}>• {sign.label || sign.code}</Text>)}</Box> : null}
        {recommendation.missing_data?.length ? <Box p={3} bg="yellow.50" borderRadius="lg"><Text fontSize="xs" fontWeight="750" color="yellow.800">Missing observations</Text><Text fontSize="xs" color="yellow.800" mt={1}>{recommendation.missing_data.join(", ")}</Text></Box> : null}
      </VStack>
      <VStack p={5} bg="gray.50" borderLeft={{ lg: "1px solid" }} borderTop={{ base: "1px solid", lg: "none" }} borderColor="gray.200" align="stretch" spacing={3}>
        <Box><Text fontWeight="800" fontSize="sm">Clinician decision</Text><Text fontSize="xs" color="gray.500" mt={1} lineHeight="1.5">Approval applies this recommendation to the queue and records your identity.</Text></Box>
        <FormControl><FormLabel fontSize="xs" mb={1}>Clinician priority</FormLabel><Select bg="white" size="sm" value={urgency} onChange={(e) => { const value = e.target.value as TriageUrgency; setUrgency(value); if (value !== recommendation.recommended_urgency && reason === "agrees_with_recommendation") setReason("clinical_judgement"); }}>{["critical","high","medium","low"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</Select></FormControl>
        <FormControl><FormLabel fontSize="xs" mb={1}>Decision reason</FormLabel><Select bg="white" size="sm" value={reason} onChange={(e) => setReason(e.target.value)}><option value="agrees_with_recommendation">Agrees with recommendation</option><option value="clinical_judgement">Clinical judgement differs</option><option value="missing_information">Missing information</option><option value="measurement_quality">Measurement quality concern</option><option value="local_protocol">Local protocol</option><option value="insufficient_evidence">Insufficient evidence</option></Select></FormControl>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} bg="white" size="sm" placeholder="Decision note (recommended)" resize="vertical" />
        <Button colorScheme="blue" isLoading={busy} onClick={() => act("approve")}>Approve priority & update queue</Button>
        <Button variant="outline" colorScheme="red" isDisabled={busy} onClick={() => act("reject")}>Reject recommendation</Button>
      </VStack>
    </Grid>
  </Box>;
}
