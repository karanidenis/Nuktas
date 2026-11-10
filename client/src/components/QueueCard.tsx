import { Box, Button, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { UrgencyBadge } from "./UrgencyBadge";
import type { QueueEntry } from "../types";

interface Props { entry: QueueEntry; onClick: (entry: QueueEntry) => void; }
const statusLabel: Record<string, string> = { waiting: "Waiting", checked_in: "Checked in", in_progress: "In care", completed: "Completed", no_show: "No show" };
function timeAgo(iso: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return mins < 1 ? "Just arrived" : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`; }

export function QueueCard({ entry, onClick }: Props) {
  const number = entry.queue_number.split("-").slice(-1)[0];
  return <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={4} boxShadow="xs" _hover={{ borderColor: "gray.300", boxShadow: "sm" }}>
    <VStack align="stretch" spacing={3}>
      <HStack justify="space-between"><HStack><Text fontFamily="mono" fontSize="xs" fontWeight="800" color="gray.500">#{number}</Text><UrgencyBadge tier={entry.urgency_tier} /></HStack><Text fontSize="xs" color="gray.400">{timeAgo(entry.inserted_at)}</Text></HStack>
      <Box><Text fontWeight="750" color="gray.900" noOfLines={1}>{entry.patient?.name ?? "Unknown patient"}</Text><Text fontSize="xs" color="gray.500" mt={1}>{statusLabel[entry.status] ?? entry.status}{entry.department ? ` · ${entry.department.name}` : " · Unassigned"}</Text></Box>
      <Box><Text fontSize="10px" color="gray.400" fontWeight="800" textTransform="uppercase" letterSpacing=".07em">Presenting concern</Text><Text mt={1} fontSize="sm" color="gray.700" noOfLines={2}>{entry.chief_complaint || "No complaint recorded"}</Text></Box>
      {entry.red_flag_details && <HStack align="flex-start" p={2.5} borderRadius="lg" bg="red.50"><Text color="red.700" fontWeight="900">!</Text><Text color="red.800" fontSize="xs" fontWeight="650" noOfLines={2}>{entry.red_flag_details}</Text></HStack>}
      <Flex pt={3} borderTop="1px solid" borderColor="gray.100" justify="space-between" align="center"><Box><Text fontSize="10px" color="gray.400">Expected wait</Text><Text fontSize="sm" fontWeight="700">{entry.status !== "waiting" ? "Not waiting" : entry.estimated_wait_time === 0 ? "Immediate" : entry.estimated_wait_time != null ? `About ${entry.estimated_wait_time} min` : "Calculating"}</Text></Box><Button size="sm" variant="outline" onClick={() => onClick(entry)}>Review patient</Button></Flex>
    </VStack>
  </Box>;
}
