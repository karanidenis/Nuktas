import {
  Box, HStack, VStack, Text, Input, InputGroup, InputLeftElement,
  Button, SimpleGrid, Spinner, Badge,
} from "@chakra-ui/react";
import { useParams, Navigate, Link as RouterLink } from "react-router-dom";
import { useClinicSocket } from "../hooks/useClinicSocket";
import { StatsBar } from "../components/StatsBar";
import { QueueCard } from "../components/QueueCard";
import { CriticalAlertBanner } from "../components/CriticalAlertBanner";
import { Sidebar } from "../components/Sidebar";
import { PatientModal } from "../components/PatientModal";
import { SearchPanel } from "../components/SearchPanel";
import { NuktasTriagePanel } from "../components/triage/NuktasTriagePanel";
import { useState, useMemo, useEffect } from "react";
import type { User, QueueEntry } from "../types";

interface Props {
  token: string | null;
  user: User | null;
  onLogout: () => void;
}

export function DashboardPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  const { queue, stats, criticalAlerts, connected, acknowledgeAlert, checkIn, updateStatus } =
    useClinicSocket(clinic_id, token);

  const [search, setSearch] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [selectedEntry, setSelectedEntry] = useState<QueueEntry | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Browser notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Cmd+K / Ctrl+K → open semantic search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    return queue.filter((e) => {
      if (filterStatus === "active" && ["completed", "no_show"].includes(e.status)) return false;
      if (filterStatus === "completed" && !["completed", "no_show"].includes(e.status)) return false;
      if (filterUrgency !== "all" && e.urgency_tier !== filterUrgency) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (e.patient?.name ?? "").toLowerCase().includes(q) ||
          e.queue_number.toLowerCase().includes(q) ||
          (e.chief_complaint ?? "").toLowerCase().includes(q) ||
          (e.department?.name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [queue, filterStatus, filterUrgency, search]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <Box minH="100vh" bg="#F5F0E8" display="flex" flexDirection="column">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <Box
        as="header"
        bg="white"
        borderBottom="2px solid"
        borderColor="neo.black"
        px={6}
        py={0}
        h="52px"
        display="flex"
        alignItems="center"
        position="sticky"
        top={0}
        zIndex={100}
        flexShrink={0}
      >
        <HStack justify="space-between" w="full">
          {/* Left — branding */}
          <HStack spacing={0}>
            <Box
              bg="#0A0A0A"
              px={3}
              h="52px"
              display="flex"
              alignItems="center"
              borderRight="2px solid"
              borderColor="neo.black"
              mr={4}
            >
              <Text
                fontWeight="800"
                fontSize="sm"
                color="#FFE600"
                letterSpacing="0.12em"
                textTransform="uppercase"
              >
                NU
              </Text>
            </Box>
            <Text fontWeight="800" fontSize="sm" letterSpacing="0.04em" mr={3}>
              Nuktas
            </Text>
            <Box
              w="1px"
              h="20px"
              bg="gray.200"
              mx={3}
            />
            <Text fontSize="xs" color="gray.500" fontWeight="600">
              Clinic Dashboard
            </Text>
          </HStack>

          {/* Right — status + search + user + logout */}
          <HStack spacing={3}>
            <HStack spacing={2} mr={2}>
              <Box
                w="6px"
                h="6px"
                borderRadius="full"
                bg={connected ? "#009944" : "#F59B00"}
                sx={connected ? {} : {
                  animation: "pulse 1.5s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.3 },
                  },
                }}
              />
              <Text
                fontSize="9px"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.05em"
                color={connected ? "#009944" : "#F59B00"}
              >
                {connected ? "Live" : "Connecting"}
              </Text>
              {criticalAlerts.length > 0 && (
                <Box
                  bg="#E50000"
                  color="white"
                  px={1.5}
                  py="1px"
                  fontSize="8px"
                  fontWeight="800"
                  textTransform="uppercase"
                  borderRadius="2px"
                  border="1px solid #0A0A0A"
                >
                  {criticalAlerts.length} Critical
                </Box>
              )}
            </HStack>

            <Box
              as="button"
              onClick={() => setSearchOpen(true)}
              display="flex"
              alignItems="center"
              gap={2}
              border="1.5px solid"
              borderColor="gray.300"
              px={3}
              h="28px"
              bg="white"
              cursor="pointer"
              _hover={{ borderColor: "#0A0A0A", color: "#0A0A0A" }}
              fontSize="10px"
              fontWeight="700"
              letterSpacing="0.08em"
              color="gray.500"
            >
              <Text>⌕ Search</Text>
              <Box
                border="1px solid"
                borderColor="gray.200"
                px={1}
                py="1px"
                fontSize="8px"
                fontFamily="mono"
                color="gray.400"
              >
                ⌘K
              </Box>
            </Box>
            {user && (
              <HStack spacing={2}>
                <Box
                  w="28px"
                  h="28px"
                  bg="#0A0A0A"
                  border="2px solid"
                  borderColor="neo.black"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Text fontSize="10px" fontWeight="800" color="white">
                    {user.name.slice(0, 1).toUpperCase()}
                  </Text>
                </Box>
                <VStack spacing={0} align="flex-start" display={{ base: "none", md: "flex" }}>
                  <Text fontSize="11px" fontWeight="700" lineHeight="1">
                    {user.name}
                  </Text>
                  <Text fontSize="9px" color="gray.400" textTransform="uppercase" letterSpacing="0.08em">
                    {user.role}
                  </Text>
                </VStack>
              </HStack>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={onLogout}
              fontSize="9px"
              letterSpacing="0.1em"
              borderColor="gray.300"
              _hover={{ borderColor: "#E50000", color: "#E50000", boxShadow: "2px 2px 0 #E50000" }}
            >
              Sign Out
            </Button>
          </HStack>
        </HStack>
      </Box>

      {/* ── Body (sidebar + main) ────────────────────────────────── */}
      <Box display="flex" flex={1} overflow="hidden">

        {/* Sidebar */}
        <Box display={{ base: "none", lg: "flex" }} flexShrink={0} overflowY="auto" h="calc(100vh - 52px)" position="sticky" top="52px">
          <Sidebar
            stats={stats}
            queue={queue}
            filterUrgency={filterUrgency}
            filterStatus={filterStatus}
            onFilterUrgency={setFilterUrgency}
            onFilterStatus={setFilterStatus}
            clinicId={clinic_id}
            token={token}
          />
        </Box>

        {/* Main content */}
        <Box flex={1} overflowY="auto" p={5} h="calc(100vh - 52px)">

          {/* Critical alerts */}
          <CriticalAlertBanner alerts={criticalAlerts} onAcknowledge={acknowledgeAlert} />

          {/* Stats */}
          {stats ? (
            <StatsBar stats={stats} />
          ) : (
            <HStack spacing={3} py={6} justify="center">
              <Spinner size="sm" color="neo.blue" />
              <Text fontSize="xs" color="gray.500" fontWeight="600">
                {connected ? "Loading queue data…" : "Connecting to clinic channel…"}
              </Text>
            </HStack>
          )}

          {/* Search + count row */}
          <HStack spacing={3} mb={4} align="center">
            <InputGroup maxW="300px" size="sm">
              <InputLeftElement pointerEvents="none" color="gray.400" fontSize="xs">
                ⌕
              </InputLeftElement>
              <Input
                placeholder="Search name, queue #, complaint…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                bg="white"
                pl={8}
                fontSize="xs"
                fontWeight="500"
              />
            </InputGroup>

            {/* Mobile-only filters */}
            <Box display={{ base: "flex", lg: "none" }} gap={2}>
              <select
                value={filterUrgency}
                onChange={(e) => setFilterUrgency(e.target.value)}
                style={{
                  border: "2px solid #0A0A0A",
                  borderRadius: "2px",
                  padding: "4px 8px",
                  fontSize: "10px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Urgency</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Box>

            <Box ml="auto">
              <Text fontSize="11px" color="gray.400" fontWeight="700" textTransform="uppercase" letterSpacing="0.1em">
                {filtered.length} patient{filtered.length !== 1 ? "s" : ""}
              </Text>
            </Box>
          </HStack>

          {/* Queue grid */}
          {!connected && queue.length === 0 ? (
            <HStack justify="center" py={16}>
              <Spinner color="neo.blue" />
              <Text fontSize="sm" color="gray.500">Connecting…</Text>
            </HStack>
          ) : filtered.length === 0 ? (
            <Box
              textAlign="center"
              py={16}
              border="2px dashed"
              borderColor="gray.300"
              bg="white"
            >
              <Text fontSize="32px" mb={3}>📋</Text>
              <Text fontWeight="700" mb={1}>No patients match</Text>
              <Text fontSize="sm" color="gray.500">
                Try adjusting the filters or search query
              </Text>
              {(filterUrgency !== "all" || filterStatus !== "active" || search) && (
                <Button
                  size="sm"
                  mt={4}
                  variant="outline"
                  onClick={() => { setFilterUrgency("all"); setFilterStatus("active"); setSearch(""); }}
                >
                  Clear filters
                </Button>
              )}
            </Box>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 2, xl: 3, "2xl": 4 }} spacing={4}>
              {filtered.map((entry) => (
                <QueueCard
                  key={entry.id}
                  entry={entry}
                  onClick={setSelectedEntry}
                />
              ))}
            </SimpleGrid>
          )}
          <Box mt={10}>
            <NuktasTriagePanel clinicId={clinic_id} token={token} />
          </Box>
        </Box>
      </Box>

      {/* Semantic search panel */}
      <SearchPanel
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        clinicId={clinic_id}
        token={token}
      />

      {/* Patient detail modal */}
      <PatientModal
        entry={selectedEntry}
        token={token}
        onClose={() => setSelectedEntry(null)}
        onCheckIn={(id) => { checkIn(id); setSelectedEntry(null); }}
        onUpdateStatus={(id, status) => { updateStatus(id, status); setSelectedEntry(null); }}
        onAcknowledge={acknowledgeAlert}
      />
    </Box>
  );
}
