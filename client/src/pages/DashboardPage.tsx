import { Box, Button, HStack, Input, InputGroup, InputLeftElement, SimpleGrid, Spinner, Text, VStack } from "@chakra-ui/react";
import { useParams, Navigate, Link as RouterLink } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useClinicSocket } from "../hooks/useClinicSocket";
import { useRecommendations } from "../hooks/useRecommendations";
import { AppShell } from "../components/AppShell";
import { StatsBar } from "../components/StatsBar";
import { QueueCard } from "../components/QueueCard";
import { CriticalAlertBanner } from "../components/CriticalAlertBanner";
import { PatientModal } from "../components/PatientModal";
import { SearchPanel } from "../components/SearchPanel";
import type { User, QueueEntry } from "../types";

interface Props { token: string | null; user: User | null; onLogout: () => void; }
const urgencyOptions = ["all", "critical", "high", "medium", "low"];
const statusOptions = [{ value: "active", label: "Active" }, { value: "waiting", label: "Waiting" }, { value: "checked_in", label: "Checked in" }, { value: "in_progress", label: "In care" }, { value: "all", label: "All" }];

export function DashboardPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  const { queue, stats, criticalAlerts, connected, acknowledgeAlert, checkIn, updateStatus } = useClinicSocket(clinic_id, token);
  const { recommendations } = useRecommendations(clinic_id, token, "pending,awaiting_approval");
  const [search, setSearch] = useState(""); const [filterUrgency, setFilterUrgency] = useState("all"); const [filterStatus, setFilterStatus] = useState("active"); const [selectedEntry, setSelectedEntry] = useState<QueueEntry | null>(null); const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const filtered = useMemo(() => queue.filter((entry) => {
    if (filterStatus === "active" && ["completed", "no_show"].includes(entry.status)) return false;
    if (!["active", "all"].includes(filterStatus) && entry.status !== filterStatus) return false;
    if (filterUrgency !== "all" && entry.urgency_tier !== filterUrgency) return false;
    const q = search.toLowerCase().trim(); if (!q) return true;
    return [entry.patient?.name, entry.queue_number, entry.chief_complaint, entry.department?.name].some((value) => value?.toLowerCase().includes(q));
  }), [queue, filterStatus, filterUrgency, search]);
  if (!token) return <Navigate to="/login" replace />;

  return <AppShell clinicId={clinic_id} user={user} onLogout={onLogout} connected={connected}>
    <HStack justify="space-between" align={{ base: "flex-start", md: "center" }} flexDirection={{ base: "column", md: "row" }} gap={4} mb={6}>
      <Box><Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-.03em">Patient queue</Text><Text fontSize="sm" color="gray.500" mt={1}>Prioritise arrivals, review context and move patients through care.</Text></Box>
      <Button variant="outline" onClick={() => setSearchOpen(true)}>Search records <Text as="span" ml={2} color="gray.400" fontSize="xs">⌘K</Text></Button>
    </HStack>

    {recommendations.length > 0 && <HStack mb={5} p={4} bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="xl" justify="space-between" align={{ base: "flex-start", sm: "center" }} flexDirection={{ base: "column", sm: "row" }}><Box><Text fontWeight="800" color="orange.900">{recommendations.length} recommendation{recommendations.length === 1 ? "" : "s"} need clinical review</Text><Text fontSize="sm" color="orange.800" mt={1}>No queue priority changes until a named clinician decides.</Text></Box><Button as={RouterLink} to={`/triage/review/${clinic_id}`} size="sm" colorScheme="orange">Open clinical review</Button></HStack>}
    <CriticalAlertBanner alerts={criticalAlerts} onAcknowledge={acknowledgeAlert} />
    {stats ? <StatsBar stats={stats} /> : <HStack justify="center" py={8}><Spinner size="sm" /><Text fontSize="sm" color="gray.500">Loading queue…</Text></HStack>}

    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={4} mb={4}>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" flexWrap="wrap" gap={3}><InputGroup maxW="430px" size="sm"><InputLeftElement color="gray.400">⌕</InputLeftElement><Input aria-label="Filter current patient queue" placeholder="Search patient, queue number or concern" value={search} onChange={(e) => setSearch(e.target.value)} /></InputGroup><Text fontSize="sm" color="gray.500"><Text as="span" fontWeight="800" color="gray.800">{filtered.length}</Text> patients</Text></HStack>
        <HStack spacing={2} overflowX="auto" pb={1}>{statusOptions.map((item) => <Button key={item.value} size="xs" flexShrink={0} variant={filterStatus === item.value ? "solid" : "outline"} colorScheme={filterStatus === item.value ? "blue" : undefined} onClick={() => setFilterStatus(item.value)}>{item.label}</Button>)}<Box w="1px" h="24px" bg="gray.200" flexShrink={0} />{urgencyOptions.map((item) => <Button key={item} size="xs" flexShrink={0} variant={filterUrgency === item ? "solid" : "ghost"} colorScheme={filterUrgency === item ? "blue" : undefined} onClick={() => setFilterUrgency(item)} textTransform="capitalize">{item === "all" ? "All priorities" : item}</Button>)}</HStack>
      </VStack>
    </Box>

    {!connected && queue.length === 0 ? <HStack justify="center" py={20}><Spinner /><Text color="gray.500">Connecting to queue…</Text></HStack> : filtered.length === 0 ? <Box textAlign="center" py={16} bg="white" border="1px dashed" borderColor="gray.300" borderRadius="xl"><Text fontWeight="800">No patients match this view</Text><Text fontSize="sm" color="gray.500" mt={1}>Try another search, status or priority.</Text></Box> : <SimpleGrid columns={{ base: 1, md: 2, "2xl": 3 }} spacing={4}>{filtered.map((entry) => <QueueCard key={entry.id} entry={entry} onClick={setSelectedEntry} />)}</SimpleGrid>}

    <SearchPanel isOpen={searchOpen} onClose={() => setSearchOpen(false)} clinicId={clinic_id} token={token} />
    <PatientModal entry={selectedEntry} token={token} onClose={() => setSelectedEntry(null)} onCheckIn={(id) => { checkIn(id); setSelectedEntry(null); }} onUpdateStatus={(id, status) => { updateStatus(id, status); setSelectedEntry(null); }} onAcknowledge={acknowledgeAlert} />
  </AppShell>;
}
