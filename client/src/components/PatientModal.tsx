import { Badge, Box, Button, Grid, HStack, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, Tab, TabList, TabPanel, TabPanels, Tabs, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { PatientHistory, QueueEntry } from "../types";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props { entry: QueueEntry | null; token: string | null; onClose: () => void; onCheckIn: (id: string) => void; onUpdateStatus: (id: string, status: string) => void; onAcknowledge: (id: string) => void; }
const statusLabel: Record<string, string> = { waiting: "Waiting", checked_in: "Checked in", in_progress: "In care", completed: "Completed", no_show: "No show" };
function timeAgo(iso: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`; }

export function PatientModal({ entry, token, onClose, onCheckIn, onUpdateStatus, onAcknowledge }: Props) {
  const [history, setHistory] = useState<PatientHistory[] | null>(null); const [loading, setLoading] = useState(false); const [tab, setTab] = useState(0);
  const fetchHistory = useCallback(async () => { if (!entry?.patient?.id || !token) return; setLoading(true); try { const res = await fetch(`/api/v1/patients/${entry.patient.id}/history`, { headers: { Authorization: `Bearer ${token}` } }); const data = res.ok ? await res.json() : { history: [] }; setHistory(data.history || []); } catch { setHistory([]); } finally { setLoading(false); } }, [entry?.patient?.id, token]);
  useEffect(() => { setHistory(null); setTab(0); }, [entry?.id]);
  useEffect(() => { if (tab === 1 && history === null) fetchHistory(); }, [tab, history, fetchHistory]);
  if (!entry) return null;

  const primary = entry.status === "waiting" ? { label: "Check in patient", run: () => onCheckIn(entry.id) } : entry.status === "checked_in" ? { label: "Start consultation", run: () => onUpdateStatus(entry.id, "in_progress") } : entry.status === "in_progress" ? { label: "Complete visit", run: () => onUpdateStatus(entry.id, "completed") } : null;
  return <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside">
    <ModalOverlay /><ModalContent maxH="92vh"><ModalCloseButton />
      <ModalHeader px={6} py={5} borderBottom="1px solid" borderColor="gray.200"><HStack align="flex-start" spacing={3}><Box w="42px" h="42px" borderRadius="full" bg="blue.50" color="blue.700" display="grid" placeItems="center" fontWeight="800">{entry.patient?.name?.split(" ").slice(0,2).map((word) => word[0]).join("") || "?"}</Box><Box flex={1}><Text fontSize="lg" fontWeight="800">{entry.patient?.name ?? "Unknown patient"}</Text><HStack mt={1} flexWrap="wrap"><Text fontSize="xs" color="gray.500">#{entry.queue_number}</Text><UrgencyBadge tier={entry.urgency_tier} /><Text fontSize="xs" color="gray.500">{statusLabel[entry.status]} · {timeAgo(entry.inserted_at)}</Text></HStack></Box></HStack></ModalHeader>
      <Tabs index={tab} onChange={setTab} variant="line"><TabList px={6}><Tab>Current visit</Tab><Tab>Visit history</Tab></TabList>
        <ModalBody px={6} py={5}><TabPanels>
          <TabPanel p={0}><VStack align="stretch" spacing={4}>
            {entry.red_flag_details && <HStack p={3} borderRadius="lg" bg="red.50" align="flex-start"><Text color="red.700" fontWeight="900">!</Text><Box><Text fontSize="xs" fontWeight="800" color="red.800">Red flag</Text><Text fontSize="sm" color="red.800" mt={1}>{entry.red_flag_details}</Text></Box></HStack>}
            <Box><Text fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing=".08em">Presenting concern</Text><Text fontSize="md" color="gray.800" mt={2} lineHeight="1.65">{entry.chief_complaint || "Not recorded"}</Text></Box>
            <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>{[
              ["Department", entry.department?.name || "Unassigned"], ["Expected wait", entry.estimated_wait_time === 0 ? "Immediate" : entry.estimated_wait_time ? `About ${entry.estimated_wait_time} min` : "—"], ["Contact", entry.patient?.phone_number || "—"]
            ].map(([label, value]) => <Box key={label} p={3} border="1px solid" borderColor="gray.200" borderRadius="lg"><Text fontSize="10px" color="gray.400" fontWeight="800" textTransform="uppercase">{label}</Text><Text fontSize="sm" fontWeight="700" mt={1}>{value}</Text></Box>)}</Grid>
            {(entry.patient?.chronic_conditions || []).length > 0 && <Box><Text fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing=".08em">Known conditions</Text><HStack mt={2} flexWrap="wrap">{entry.patient!.chronic_conditions.map((condition) => <Badge key={condition} textTransform="none" bg="gray.100" color="gray.700">{condition}</Badge>)}</HStack></Box>}
            <Box p={3} bg="blue.50" borderRadius="lg"><Text fontSize="xs" fontWeight="800" color="blue.800">Next workflow action</Text><Text fontSize="sm" color="blue.800" mt={1}>{primary ? `${primary.label}. This action will be recorded in the clinic activity log.` : "No further queue action is required for this visit."}</Text></Box>
          </VStack></TabPanel>
          <TabPanel p={0}>{loading ? <HStack py={8} justify="center"><Spinner size="sm" /><Text fontSize="sm" color="gray.500">Loading history…</Text></HStack> : history?.length ? <VStack align="stretch" spacing={2}>{history.map((visit) => <Box key={visit.id} border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}><HStack justify="space-between"><Text fontSize="xs" color="gray.500">{new Date(visit.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</Text>{visit.urgency_tier && <UrgencyBadge tier={visit.urgency_tier} />}</HStack><Text fontSize="sm" fontWeight="650" mt={2}>{visit.chief_complaint || "No complaint recorded"}</Text><Text fontSize="xs" color="gray.500" mt={1}>{visit.recommended_department || "No department recorded"}</Text></Box>)}</VStack> : <Box textAlign="center" py={10}><Text fontWeight="700">No previous visits</Text><Text fontSize="sm" color="gray.500" mt={1}>This is the first recorded visit for this patient.</Text></Box>}</TabPanel>
        </TabPanels></ModalBody>
      </Tabs>
      <ModalFooter borderTop="1px solid" borderColor="gray.200" justifyContent="space-between" gap={3} flexWrap="wrap">
        <HStack>{entry.urgency_tier === "critical" && !entry.critical_alert_acknowledged && <Button size="sm" variant="outline" colorScheme="red" onClick={() => onAcknowledge(entry.id)}>Acknowledge critical alert</Button>}{entry.status === "waiting" && <Button size="sm" variant="ghost" colorScheme="red" onClick={() => onUpdateStatus(entry.id, "no_show")}>Mark no show</Button>}</HStack>
        <HStack><Button variant="ghost" onClick={onClose}>Close</Button>{primary && <Button colorScheme="blue" onClick={primary.run}>{primary.label}</Button>}</HStack>
      </ModalFooter>
    </ModalContent>
  </Modal>;
}
