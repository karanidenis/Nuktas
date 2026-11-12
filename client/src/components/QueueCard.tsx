import { Badge, Box, Button, Grid, HStack, Text } from "@chakra-ui/react";
import { UrgencyBadge } from "./UrgencyBadge";
import type { QueueEntry } from "../types";

interface Props { entry: QueueEntry; onClick: (entry: QueueEntry) => void; }
const statusLabel: Record<string, string> = { waiting: "Waiting", checked_in: "Checked in", in_progress: "In care", completed: "Completed", no_show: "No show" };
function elapsedMinutes(iso: string) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }
function elapsedLabel(iso: string) { const mins = elapsedMinutes(iso); return mins < 1 ? "Just arrived" : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`; }
function arrivalLabel(iso: string) { return elapsedMinutes(iso) < 1 ? "arrived just now" : `arrived ${elapsedLabel(iso)} ago`; }
function waitLabel(entry: QueueEntry) {
  if (entry.status !== "waiting") return statusLabel[entry.status] ?? entry.status;
  if (entry.urgency_tier === "critical" || entry.estimated_wait_time === 0) return "Assess immediately";
  return `${elapsedLabel(entry.inserted_at)} waiting`;
}

export function QueueCard({ entry, onClick }: Props) {
  const number = entry.queue_number.split("-").slice(-1)[0];
  const critical = entry.urgency_tier === "critical" && entry.status === "waiting";
  return <Box bg="white" border="1px solid" borderColor={critical ? "red.200" : "gray.200"} borderRadius="xl" px={{ base: 4, md: 5 }} py={4} boxShadow="xs" _hover={{ borderColor: critical ? "red.300" : "blue.300", boxShadow: "sm" }}>
    <Grid templateColumns={{ base: "1fr", md: "minmax(180px, .85fr) minmax(260px, 1.35fr) minmax(155px, .65fr) auto" }} gap={{ base: 3, md: 5 }} alignItems="center">
      <Box><HStack spacing={2} mb={1}><UrgencyBadge tier={entry.urgency_tier} /><Text fontFamily="mono" fontSize="xs" fontWeight="800" color="gray.600">#{number}</Text></HStack><Text fontWeight="800" color="gray.900" noOfLines={1}>{entry.patient?.name ?? "Unknown patient"}</Text><Text fontSize="xs" color="gray.600" mt={1}>{entry.patient?.phone_number || "No contact number"}</Text></Box>
      <Box minW={0}><Text fontSize="xs" color="gray.600" fontWeight="700">Presenting concern</Text><Text mt={1} fontSize="sm" color="gray.800" noOfLines={2}>{entry.chief_complaint || "No complaint recorded"}</Text>{entry.red_flag_details && <Text mt={1} color="red.700" fontSize="xs" fontWeight="700" noOfLines={1}>Red flag: {entry.red_flag_details}</Text>}</Box>
      <Box><Badge colorScheme={entry.status === "in_progress" ? "green" : entry.status === "checked_in" ? "purple" : critical ? "red" : "gray"} textTransform="none">{waitLabel(entry)}</Badge><Text fontSize="xs" color="gray.600" mt={2}>{entry.department?.name || "Unassigned"} · {arrivalLabel(entry.inserted_at)}</Text></Box>
      <Button size="sm" colorScheme={critical ? "red" : "blue"} variant={critical ? "solid" : "outline"} onClick={() => onClick(entry)}>{critical ? "Review now" : "Open patient"}</Button>
    </Grid>
  </Box>;
}
