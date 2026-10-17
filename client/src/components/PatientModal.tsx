import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  Box, HStack, VStack, Text, Button, Tabs, TabList, Tab, TabPanels, TabPanel,
  Spinner, Divider, Grid, Textarea,
} from "@chakra-ui/react";
import { useState, useEffect, useCallback } from "react";
import type { QueueEntry, PatientHistory } from "../types";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props {
  entry: QueueEntry | null;
  token: string | null;
  onClose: () => void;
  onCheckIn: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onAcknowledge: (id: string) => void;
}

const statusDotColor: Record<string, string> = {
  waiting:     "#B0AA9E",
  checked_in:  "#0047FF",
  in_progress: "#009944",
  completed:   "#7C3AED",
  no_show:     "#E50000",
};

const statusLabel: Record<string, string> = {
  waiting:     "Waiting",
  checked_in:  "Checked In",
  in_progress: "In Progress",
  completed:   "Completed",
  no_show:     "No Show",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function HistoryRow({ visit }: { visit: PatientHistory }) {
  const date = new Date(visit.date);
  return (
    <Box border="1.5px solid" borderColor="gray.200" p={3} bg="white">
      <HStack justify="space-between" mb={1}>
        <Text fontSize="11px" fontWeight="700" fontFamily="mono" color="gray.500">
          {date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
        {visit.urgency_tier && <UrgencyBadge tier={visit.urgency_tier} />}
      </HStack>
      <Text fontSize="12px" fontWeight="600" mb={1}>
        {visit.chief_complaint ?? "No complaint recorded"}
      </Text>
      {visit.recommended_department && (
        <Text fontSize="11px" color="gray.500">
          → {visit.recommended_department}
        </Text>
      )}
      {visit.red_flag_detected && (
        <Text fontSize="10px" color="#E50000" fontWeight="700" mt={1}>⚠ Red flag detected</Text>
      )}
    </Box>
  );
}

export function PatientModal({ entry, token, onClose, onCheckIn, onUpdateStatus, onAcknowledge }: Props) {
  const isOpen = entry !== null;
  const [history, setHistory] = useState<PatientHistory[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);

  // Feature 5: Follow-up SMS state
  const [smsState, setSmsState] = useState<"idle" | "generating" | "ready" | "sending" | "sent" | "error">("idle");
  const [smsDraft, setSmsDraft] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!entry?.patient?.id || !token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/v1/patients/${entry.patient.id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [entry?.patient?.id, token]);

  // Reset state when entry changes
  useEffect(() => {
    setHistory(null);
    setTabIndex(0);
    setSmsState("idle");
    setSmsDraft("");
    setSmsError(null);
  }, [entry?.id]);

  const generateSms = useCallback(async () => {
    if (!entry || !token) return;
    setSmsState("generating");
    setSmsError(null);
    try {
      const res = await fetch(`/api/v1/queue/${entry.id}/followup-sms/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSmsDraft(data.draft ?? "");
      setSmsState("ready");
    } catch (e: any) {
      setSmsError(e.message);
      setSmsState("error");
    }
  }, [entry, token]);

  const sendSms = useCallback(async () => {
    if (!entry || !token || !smsDraft) return;
    setSmsState("sending");
    setSmsError(null);
    try {
      const res = await fetch(`/api/v1/queue/${entry.id}/followup-sms/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: smsDraft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSmsState("sent");
    } catch (e: any) {
      setSmsError(e.message);
      setSmsState("error");
    }
  }, [entry, token, smsDraft]);

  // Fetch history when history tab is selected
  useEffect(() => {
    if (tabIndex === 1 && history === null) {
      fetchHistory();
    }
  }, [tabIndex, history, fetchHistory]);

  if (!entry) return null;

  const urgencyColor = {
    critical: "#E50000",
    high: "#FF6300",
    medium: "#F59B00",
    low: "#009944",
  }[entry.urgency_tier] ?? "#0A0A0A";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxH="90vh">
        {/* Close button styled */}
        <ModalCloseButton />

        {/* Header */}
        <ModalHeader p={0}>
          {/* Urgency stripe */}
          <Box h="6px" bg={urgencyColor} />

          <Box px={6} pt={5} pb={4}>
            <HStack spacing={4} align="flex-start">
              {/* Avatar */}
              <Box
                w="52px"
                h="52px"
                bg={urgencyColor}
                border="2px solid"
                borderColor="neo.black"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Text fontWeight="800" fontSize="lg" color="white" fontFamily="mono">
                  {initials(entry.patient?.name ?? null)}
                </Text>
              </Box>

              <Box flex={1}>
                <Text fontWeight="800" fontSize="lg" lineHeight="1.2" mb={1}>
                  {entry.patient?.name ?? "Unknown Patient"}
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  <Text fontSize="xs" color="gray.500" fontFamily="mono">
                    {entry.patient?.phone_number ?? "—"}
                  </Text>
                  <Text color="gray.300">·</Text>
                  <Text fontSize="xs" fontFamily="mono" color="gray.500">
                    #{entry.queue_number}
                  </Text>
                </HStack>
                <HStack mt={2} spacing={2} flexWrap="wrap">
                  <UrgencyBadge tier={entry.urgency_tier} />
                  <HStack spacing={1}>
                    <Box w="7px" h="7px" borderRadius="full" bg={statusDotColor[entry.status] ?? "#B0AA9E"} />
                    <Text fontSize="10px" fontWeight="700" textTransform="uppercase" letterSpacing="0.1em" color="gray.600">
                      {statusLabel[entry.status] ?? entry.status}
                    </Text>
                  </HStack>
                  <Text fontSize="10px" color="gray.400" fontWeight="600">
                    · {timeAgo(entry.inserted_at)}
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </Box>
        </ModalHeader>

        {/* Tabs */}
        <Tabs index={tabIndex} onChange={setTabIndex} variant="line" size="sm">
          <TabList px={6}>
            <Tab>Overview</Tab>
            <Tab>
              History
              {history && history.length > 0 && (
                <Box
                  as="span"
                  ml={1}
                  bg="neo.black"
                  color="white"
                  fontSize="9px"
                  fontWeight="800"
                  px="5px"
                  py="1px"
                  borderRadius="2px"
                >
                  {history.length}
                </Box>
              )}
            </Tab>
            <Tab>Actions</Tab>
          </TabList>

          <ModalBody px={6} py={5}>
            <TabPanels>
              {/* ── Overview ─────────────────────────────────────── */}
              <TabPanel p={0}>
                <VStack spacing={4} align="stretch">
                  {/* Chief complaint */}
                  <Box>
                    <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={2}>
                      Chief Complaint
                    </Text>
                    <Box bg="gray.50" border="1.5px solid" borderColor="gray.200" p={3}>
                      <Text fontSize="sm" fontWeight="600" lineHeight="1.5">
                        {entry.chief_complaint ?? "Not recorded"}
                      </Text>
                    </Box>
                  </Box>

                  {/* Red flags */}
                  {entry.red_flag_details && (
                    <Box>
                      <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="#E50000" mb={2}>
                        ⚠ Red Flags
                      </Text>
                      <Box bg="#FFF0F0" border="2px solid" borderColor="#FFAAAA" p={3}>
                        <Text fontSize="sm" fontWeight="700" color="#CC0000" lineHeight="1.5">
                          {entry.red_flag_details}
                        </Text>
                      </Box>
                    </Box>
                  )}

                  {/* Department + Wait */}
                  <Grid templateColumns="1fr 1fr" gap={3}>
                    <Box>
                      <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={2}>
                        Department
                      </Text>
                      <Box bg="white" border="1.5px solid" borderColor="gray.200" p={3}>
                        <Text fontSize="sm" fontWeight="700">
                          {entry.department?.name ?? "Unassigned"}
                        </Text>
                      </Box>
                    </Box>
                    <Box>
                      <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={2}>
                        Est. Wait
                      </Text>
                      <Box bg="white" border="1.5px solid" borderColor="gray.200" p={3}>
                        <Text fontSize="sm" fontWeight="700" color={entry.urgency_tier === "critical" ? "#E50000" : "inherit"}>
                          {entry.estimated_wait_time === 0
                            ? "Immediate"
                            : entry.estimated_wait_time
                            ? `~${entry.estimated_wait_time} min`
                            : "—"}
                        </Text>
                      </Box>
                    </Box>
                  </Grid>

                  {/* Chronic conditions */}
                  {(entry.patient?.chronic_conditions ?? []).length > 0 && (
                    <Box>
                      <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={2}>
                        Chronic Conditions
                      </Text>
                      <HStack flexWrap="wrap" spacing={2}>
                        {entry.patient!.chronic_conditions.map((c) => (
                          <Box
                            key={c}
                            bg="#EEE8FF"
                            border="1.5px solid"
                            borderColor="#7C3AED"
                            px={3}
                            py="4px"
                            fontSize="10px"
                            fontWeight="700"
                            textTransform="uppercase"
                            letterSpacing="0.08em"
                            color="#7C3AED"
                            borderRadius="2px"
                          >
                            {c}
                          </Box>
                        ))}
                      </HStack>
                    </Box>
                  )}

                  {/* Contact */}
                  {entry.patient?.phone_number && (
                    <Box>
                      <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={2}>
                        Contact
                      </Text>
                      <Box bg="white" border="1.5px solid" borderColor="gray.200" p={3}>
                        <Text fontSize="sm" fontWeight="600" fontFamily="mono">
                          {entry.patient.phone_number}
                        </Text>
                      </Box>
                    </Box>
                  )}
                </VStack>
              </TabPanel>

              {/* ── History ──────────────────────────────────────── */}
              <TabPanel p={0}>
                {historyLoading ? (
                  <HStack justify="center" py={8}>
                    <Spinner size="sm" color="neo.blue" />
                    <Text fontSize="sm" color="gray.500">Loading history…</Text>
                  </HStack>
                ) : !history ? (
                  <Text fontSize="sm" color="gray.500" py={4}>Select the History tab to load.</Text>
                ) : history.length === 0 ? (
                  <Box
                    textAlign="center"
                    py={8}
                    border="2px dashed"
                    borderColor="gray.200"
                  >
                    <Text fontSize="2xl" mb={2}>📋</Text>
                    <Text fontSize="sm" color="gray.500">No previous visits on record</Text>
                  </Box>
                ) : (
                  <VStack spacing={2} align="stretch">
                    <Text fontSize="10px" color="gray.400" fontWeight="600" mb={1}>
                      {history.length} previous visit{history.length !== 1 ? "s" : ""}
                    </Text>
                    {history.map((v) => (
                      <HistoryRow key={v.id} visit={v} />
                    ))}
                  </VStack>
                )}
              </TabPanel>

              {/* ── Actions ──────────────────────────────────────── */}
              <TabPanel p={0}>
                <VStack spacing={3} align="stretch">
                  <Box bg="gray.50" border="1.5px solid" borderColor="gray.200" p={3}>
                    <HStack>
                      <Box w="8px" h="8px" borderRadius="full" bg={statusDotColor[entry.status] ?? "#B0AA9E"} />
                      <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.1em">
                        Current status: {statusLabel[entry.status]}
                      </Text>
                    </HStack>
                  </Box>

                  <Divider />

                  {entry.status === "waiting" && (
                    <>
                      <Button
                        colorScheme="blue"
                        bg="neo.blue"
                        color="white"
                        size="md"
                        w="full"
                        onClick={() => { onCheckIn(entry.id); onClose(); }}
                      >
                        Check In Patient →
                      </Button>
                      <Button
                        variant="outline"
                        size="md"
                        w="full"
                        color="#E50000"
                        borderColor="#E50000"
                        _hover={{ bg: "#FFF0F0", boxShadow: "3px 3px 0 #E50000" }}
                        onClick={() => { onUpdateStatus(entry.id, "no_show"); onClose(); }}
                      >
                        Mark as No Show
                      </Button>
                    </>
                  )}

                  {entry.status === "checked_in" && (
                    <Button
                      bg="#009944"
                      color="white"
                      borderColor="#009944"
                      size="md"
                      w="full"
                      onClick={() => { onUpdateStatus(entry.id, "in_progress"); onClose(); }}
                    >
                      Start Consultation →
                    </Button>
                  )}

                  {entry.status === "in_progress" && (
                    <>
                      <Button
                        bg="#7C3AED"
                        color="white"
                        borderColor="#7C3AED"
                        size="md"
                        w="full"
                        onClick={() => { onUpdateStatus(entry.id, "completed"); onClose(); }}
                      >
                        Mark as Completed ✓
                      </Button>
                      <Button
                        variant="outline"
                        size="md"
                        w="full"
                        color="#E50000"
                        borderColor="#E50000"
                        _hover={{ bg: "#FFF0F0", boxShadow: "3px 3px 0 #E50000" }}
                        onClick={() => { onUpdateStatus(entry.id, "no_show"); onClose(); }}
                      >
                        Mark as No Show
                      </Button>
                    </>
                  )}

                  {(entry.status === "completed" || entry.status === "no_show") && (
                    <Box
                      bg="gray.50"
                      border="1.5px solid"
                      borderColor="gray.200"
                      p={4}
                      textAlign="center"
                    >
                      <Text fontSize="sm" color="gray.500">
                        This patient's visit is complete.
                      </Text>
                    </Box>
                  )}

                  {entry.urgency_tier === "critical" && !entry.critical_alert_acknowledged && (
                    <>
                      <Divider />
                      <Button
                        bg="#FFE600"
                        color="#0A0A0A"
                        borderColor="#0A0A0A"
                        size="md"
                        w="full"
                        onClick={() => { onAcknowledge(entry.id); }}
                      >
                        Acknowledge Critical Alert ⚠
                      </Button>
                    </>
                  )}

                  {/* ── Feature 5: Follow-up SMS ── */}
                  {entry.patient?.phone_number && (
                    <>
                      <Divider />
                      <Box>
                        <HStack mb={2} justify="space-between">
                          <HStack spacing={2}>
                            <Box
                              bg="#0A0A0A"
                              px={2}
                              py="2px"
                              fontSize="8px"
                              fontWeight="800"
                              color="#FFE600"
                              letterSpacing="0.1em"
                              textTransform="uppercase"
                            >
                              AI SMS
                            </Box>
                            <Text fontSize="9px" fontWeight="700" color="gray.500" textTransform="uppercase" letterSpacing="0.08em">
                              Follow-up Message
                            </Text>
                          </HStack>
                          <Text fontSize="9px" color="gray.400" fontFamily="mono">
                            {entry.patient.phone_number}
                          </Text>
                        </HStack>

                        {smsState === "idle" && (
                          <Button
                            variant="outline"
                            size="sm"
                            w="full"
                            fontSize="10px"
                            fontWeight="700"
                            letterSpacing="0.08em"
                            borderColor="#0A0A0A"
                            _hover={{ bg: "#0A0A0A", color: "white", boxShadow: "3px 3px 0 #0A0A0A" }}
                            onClick={generateSms}
                          >
                            ✨ Generate Follow-up SMS
                          </Button>
                        )}

                        {smsState === "generating" && (
                          <HStack justify="center" py={3}>
                            <Spinner size="xs" color="neo.blue" />
                            <Text fontSize="11px" color="gray.500">Drafting message…</Text>
                          </HStack>
                        )}

                        {(smsState === "ready" || smsState === "sending" || smsState === "error") && (
                          <VStack spacing={2} align="stretch">
                            <Box position="relative">
                              <Textarea
                                value={smsDraft}
                                onChange={(e) => setSmsDraft(e.target.value.slice(0, 160))}
                                rows={3}
                                fontSize="12px"
                                fontFamily="mono"
                                fontWeight="500"
                                bg="white"
                                border="2px solid"
                                borderColor={smsDraft.length > 150 ? "#F59B00" : "gray.300"}
                                resize="none"
                                _focus={{ borderColor: "#0047FF", boxShadow: "3px 3px 0 #0047FF" }}
                              />
                              <Box
                                position="absolute"
                                bottom={2}
                                right={2}
                                fontSize="9px"
                                fontWeight="700"
                                fontFamily="mono"
                                color={smsDraft.length > 150 ? "#F59B00" : smsDraft.length === 160 ? "#E50000" : "gray.400"}
                              >
                                {smsDraft.length}/160
                              </Box>
                            </Box>

                            {smsError && (
                              <Text fontSize="10px" color="#E50000" fontWeight="600">
                                ⚠ {smsError}
                              </Text>
                            )}

                            <HStack spacing={2}>
                              <Button
                                variant="outline"
                                size="sm"
                                fontSize="10px"
                                flex={1}
                                onClick={generateSms}
                              >
                                Regenerate
                              </Button>
                              <Button
                                bg="#009944"
                                color="white"
                                size="sm"
                                fontSize="10px"
                                fontWeight="700"
                                flex={2}
                                isLoading={smsState === "sending"}
                                loadingText="Sending…"
                                isDisabled={!smsDraft || smsDraft.length > 160}
                                onClick={sendSms}
                                _hover={{ bg: "#007733", boxShadow: "3px 3px 0 #007733" }}
                              >
                                Send SMS →
                              </Button>
                            </HStack>
                          </VStack>
                        )}

                        {smsState === "sent" && (
                          <Box
                            bg="#F0FFF4"
                            border="2px solid"
                            borderColor="#009944"
                            p={3}
                            textAlign="center"
                          >
                            <Text fontSize="sm" fontWeight="700" color="#009944">
                              ✓ SMS sent to {entry.patient.phone_number}
                            </Text>
                          </Box>
                        )}
                      </Box>
                    </>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </ModalBody>
        </Tabs>

        <ModalFooter justifyContent="flex-start">
          <Text fontSize="10px" color="gray.400" fontFamily="mono">
            Queue entry: {entry.id.slice(0, 8)}…
            {entry.position_in_queue != null && ` · Position #${entry.position_in_queue}`}
          </Text>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
