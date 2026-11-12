import {
  Badge, Box, Button, Grid, HStack, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, Tab, TabList,
  TabPanel, TabPanels, Tabs, Text, VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { PatientHistory, QueueEntry } from "../types";
import type { Recommendation } from "../types/triage";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props {
  entry: QueueEntry | null;
  recommendation?: Recommendation;
  token: string | null;
  onClose: () => void;
  onCheckIn: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onAcknowledge: (id: string) => void;
}

const statusLabel: Record<string, string> = { waiting: "Waiting", checked_in: "Checked in", in_progress: "In care", completed: "Completed", no_show: "No show" };
const vitalLabel: Record<string, string> = { respiratory_rate: "Resp. rate", heart_rate: "Heart rate", systolic_bp: "Systolic BP", temperature_c: "Temperature", avpu: "AVPU", mobility: "Mobility", trauma: "Recent trauma" };
const vitalUnit: Record<string, string> = { respiratory_rate: "/min", heart_rate: "bpm", systolic_bp: "mmHg", temperature_c: "°C" };
function timeAgo(iso: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`; }

export function PatientModal({ entry, recommendation, token, onClose, onCheckIn, onUpdateStatus, onAcknowledge }: Props) {
  const [history, setHistory] = useState<PatientHistory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const fetchHistory = useCallback(async () => {
    if (!entry?.patient?.id || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/patients/${entry.patient.id}/history`, { headers: { Authorization: `Bearer ${token}` } });
      const data = res.ok ? await res.json() : { history: [] };
      setHistory(data.history || []);
    } catch { setHistory([]); } finally { setLoading(false); }
  }, [entry?.patient?.id, token]);
  useEffect(() => { setHistory(null); setTab(0); }, [entry?.id]);
  useEffect(() => { if (tab === 1 && history === null) fetchHistory(); }, [tab, history, fetchHistory]);
  if (!entry) return null;

  const primary = entry.status === "waiting" ? { label: "Check in patient", run: () => onCheckIn(entry.id) }
    : entry.status === "checked_in" ? { label: "Start consultation", run: () => onUpdateStatus(entry.id, "in_progress") }
      : entry.status === "in_progress" ? { label: "Complete visit", run: () => onUpdateStatus(entry.id, "completed") } : null;
  const awaitingDecision = recommendation && ["pending", "awaiting_approval"].includes(recommendation.status);
  const observations = (recommendation?.tews_breakdown || []).filter((item) => item?.vital).slice(0, 7);
  const waitDisplay = recommendation?.recommended_urgency === "critical" && awaitingDecision
    ? "Critical review pending"
    : entry.urgency_tier === "critical" || entry.estimated_wait_time === 0
      ? "Immediate assessment"
      : entry.estimated_wait_time ? `About ${entry.estimated_wait_time} min` : "—";

  return <Modal isOpen onClose={onClose} size="5xl" scrollBehavior="inside">
    <ModalOverlay />
    <ModalContent maxH="92vh">
      <ModalCloseButton />
      <ModalHeader px={6} py={5} borderBottom="1px solid" borderColor="gray.200">
        <HStack align="flex-start" spacing={3}>
          <Box w="42px" h="42px" borderRadius="full" bg="blue.50" color="blue.700" display="grid" placeItems="center" fontWeight="800">{entry.patient?.name?.split(" ").slice(0, 2).map((word) => word[0]).join("") || "?"}</Box>
          <Box flex={1}><Text fontSize="lg" fontWeight="800">{entry.patient?.name ?? "Unknown patient"}</Text><HStack mt={1} flexWrap="wrap"><Text fontSize="xs" color="gray.600">#{entry.queue_number}</Text><UrgencyBadge tier={entry.urgency_tier} /><Text fontSize="xs" color="gray.600">{statusLabel[entry.status]} · {timeAgo(entry.inserted_at)}</Text></HStack></Box>
        </HStack>
      </ModalHeader>
      <Tabs index={tab} onChange={setTab} variant="line">
        <TabList px={6}><Tab>Overview & actions</Tab><Tab>Visit history</Tab></TabList>
        <ModalBody px={6} py={5}>
          <TabPanels>
            <TabPanel p={0}>
              <Grid templateColumns={{ base: "1fr", lg: recommendation ? "minmax(0, 1.45fr) minmax(280px, .75fr)" : "1fr" }} gap={5} alignItems="start">
                <VStack align="stretch" spacing={4}>
                  {entry.red_flag_details && <HStack p={3} borderRadius="lg" bg="red.50" align="flex-start"><Text color="red.700" fontWeight="900">!</Text><Box><Text fontSize="xs" fontWeight="800" color="red.800">Red flag</Text><Text fontSize="sm" color="red.800" mt={1}>{entry.red_flag_details}</Text></Box></HStack>}
                  <Box><Text fontSize="xs" fontWeight="800" color="gray.600" textTransform="uppercase" letterSpacing=".06em">Presenting concern</Text><Text fontSize="md" color="gray.800" mt={2} lineHeight="1.65">{entry.chief_complaint || "Not recorded"}</Text></Box>
                  <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>{[["Department", entry.department?.name || "Unassigned"], ["Care target", waitDisplay], ["Contact", entry.patient?.phone_number || "—"]].map(([label, value]) => <Box key={label} p={3} border="1px solid" borderColor="gray.200" borderRadius="lg"><Text fontSize="xs" color="gray.600" fontWeight="800" textTransform="uppercase">{label}</Text><Text fontSize="sm" fontWeight="700" mt={1}>{value}</Text></Box>)}</Grid>
                  {(entry.patient?.chronic_conditions || []).length > 0 && <Box><Text fontSize="xs" fontWeight="800" color="gray.600" textTransform="uppercase">Known conditions</Text><HStack mt={2} flexWrap="wrap">{entry.patient!.chronic_conditions.map((condition) => <Badge key={condition} textTransform="none" bg="gray.100" color="gray.700">{condition}</Badge>)}</HStack></Box>}
                  {observations.length > 0 && <Box><HStack justify="space-between" mb={2}><Text fontSize="xs" fontWeight="800" color="gray.700" textTransform="uppercase">Recorded observations</Text><Text fontSize="xs" color="gray.600">TEWS contribution</Text></HStack><Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }} gap={2}>{observations.map((item) => <Box key={item.vital} p={3} border="1px solid" borderColor={item.points >= 2 ? "orange.200" : "gray.200"} bg={item.points >= 2 ? "orange.50" : "white"} borderRadius="lg"><Text fontSize="xs" color="gray.600">{vitalLabel[item.vital] || item.vital.split("_").join(" ")}</Text><Text fontSize="lg" fontWeight="850" mt={1}>{String(item.value)} <Text as="span" fontSize="xs" color="gray.600" fontWeight="600">{vitalUnit[item.vital] || ""}</Text></Text><Text fontSize="xs" color={item.points >= 2 ? "orange.800" : "gray.600"}>{item.points} TEWS point{item.points === 1 ? "" : "s"}</Text></Box>)}</Grid></Box>}
                  <Box p={3} bg="blue.50" borderRadius="lg"><Text fontSize="xs" fontWeight="800" color="blue.800">Next workflow action</Text><Text fontSize="sm" color="blue.800" mt={1}>{primary ? `${primary.label}. This action will be recorded in the clinic activity log.` : "No further queue action is required for this visit."}</Text></Box>
                </VStack>
                {recommendation && <Box border="1px solid" borderColor={recommendation.recommended_urgency === "critical" ? "red.200" : "orange.200"} borderRadius="xl" overflow="hidden">
                  <Box p={4} bg={recommendation.recommended_urgency === "critical" ? "red.50" : "orange.50"}><Text fontSize="xs" fontWeight="800" color="gray.700" textTransform="uppercase">Decision support · {awaitingDecision ? "awaiting review" : recommendation.status}</Text><HStack mt={2}><UrgencyBadge tier={recommendation.recommended_urgency} /><Text fontSize="sm" fontWeight="800">SATS {recommendation.sats_colour} · TEWS {recommendation.tews_score ?? "—"}</Text></HStack></Box>
                  <VStack align="stretch" spacing={3} p={4}><Box><Text fontSize="xs" color="gray.600" fontWeight="700">Why this priority</Text><Text mt={1} fontSize="sm" color="gray.800" lineHeight="1.6">{recommendation.rationale || "No rationale recorded."}</Text></Box>{recommendation.clinical_signs?.length ? <Box><Text fontSize="xs" color="gray.600" fontWeight="700">Clinical signals</Text>{recommendation.clinical_signs.map((sign) => <Text key={sign.code || sign.label} fontSize="sm" color="red.700" mt={1}>• {sign.label || sign.code}</Text>)}</Box> : null}{recommendation.missing_data?.length ? <Box p={3} bg="yellow.50" borderRadius="lg"><Text fontSize="xs" fontWeight="800" color="yellow.800">{awaitingDecision ? "Complete before deciding" : "Observation gap recorded"}</Text><Text fontSize="sm" color="yellow.900" mt={1}>{recommendation.missing_data.map((item) => item.split("_").join(" ")).join(", ")}</Text></Box> : null}<Text fontSize="xs" color="gray.600">{awaitingDecision ? "Open Clinical review to approve or override this recommendation. It cannot change the queue on its own." : `Decision status: ${recommendation.status}. The clinical audit trail remains available in Operations.`}</Text></VStack>
                </Box>}
              </Grid>
            </TabPanel>
            <TabPanel p={0}>{loading ? <HStack py={8} justify="center"><Spinner size="sm" /><Text fontSize="sm" color="gray.600">Loading history…</Text></HStack> : history?.length ? <VStack align="stretch" spacing={2}>{history.map((visit) => <Box key={visit.id} border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}><HStack justify="space-between"><Text fontSize="xs" color="gray.600">{new Date(visit.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</Text>{visit.urgency_tier && <UrgencyBadge tier={visit.urgency_tier} />}</HStack><Text fontSize="sm" fontWeight="650" mt={2}>{visit.chief_complaint || "No complaint recorded"}</Text><Text fontSize="xs" color="gray.600" mt={1}>{visit.recommended_department || "No department recorded"}</Text></Box>)}</VStack> : <Box textAlign="center" py={10}><Text fontWeight="700">No previous visits</Text><Text fontSize="sm" color="gray.600" mt={1}>This is the first recorded visit for this patient.</Text></Box>}</TabPanel>
          </TabPanels>
        </ModalBody>
      </Tabs>
      <ModalFooter borderTop="1px solid" borderColor="gray.200" justifyContent="space-between" gap={3} flexWrap="wrap">
        <HStack>{entry.urgency_tier === "critical" && !entry.critical_alert_acknowledged && <Button size="sm" variant="outline" colorScheme="red" onClick={() => onAcknowledge(entry.id)}>Acknowledge critical alert</Button>}{entry.status === "waiting" && <Button size="sm" variant="ghost" colorScheme="red" onClick={() => onUpdateStatus(entry.id, "no_show")}>Mark no show</Button>}</HStack>
        <HStack><Button variant="ghost" onClick={onClose}>Close</Button>{primary && <Button colorScheme="blue" onClick={primary.run}>{primary.label}</Button>}</HStack>
      </ModalFooter>
    </ModalContent>
  </Modal>;
}
