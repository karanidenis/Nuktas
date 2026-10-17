import { Box, HStack, VStack, Text, Flex } from "@chakra-ui/react";
import { UrgencyBadge, urgencyStripeColor } from "./UrgencyBadge";
import type { QueueEntry } from "../types";

interface Props {
  entry: QueueEntry;
  onClick: (entry: QueueEntry) => void;
}

const statusLabel: Record<string, string> = {
  waiting:     "Waiting",
  checked_in:  "Checked In",
  in_progress: "In Progress",
  completed:   "Completed",
  no_show:     "No Show",
};

const statusDot: Record<string, string> = {
  waiting:     "#B0AA9E",
  checked_in:  "#0047FF",
  in_progress: "#009944",
  completed:   "#7C3AED",
  no_show:     "#E50000",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function QueueCard({ entry, onClick }: Props) {
  const stripe = urgencyStripeColor(entry.urgency_tier);
  const isCritical = entry.urgency_tier === "critical";

  return (
    <Box
      bg="white"
      border="2px solid"
      borderColor="neo.black"
      boxShadow={isCritical ? `4px 4px 0 ${stripe}` : "4px 4px 0 #0A0A0A"}
      cursor="pointer"
      onClick={() => onClick(entry)}
      transition="box-shadow 0.08s ease, transform 0.08s ease"
      _hover={{
        boxShadow: isCritical ? `6px 6px 0 ${stripe}` : "6px 6px 0 #0A0A0A",
        transform: "translate(-2px,-2px)",
      }}
      _active={{
        boxShadow: "2px 2px 0 #0A0A0A",
        transform: "translate(2px,2px)",
      }}
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      {/* Urgency stripe */}
      <Box h="5px" bg={stripe} flexShrink={0} />

      <Box p={4} flex={1} display="flex" flexDirection="column">
        {/* Top row */}
        <HStack justify="space-between" mb={3}>
          <HStack spacing={2} flexWrap="wrap">
            <Text
              fontFamily="mono"
              fontSize="xs"
              fontWeight="700"
              color="gray.500"
              letterSpacing="0.04em"
            >
              #{entry.queue_number.split("-").slice(-1)[0]}
            </Text>
            <UrgencyBadge tier={entry.urgency_tier} />
          </HStack>
          <Text fontSize="10px" color="gray.400" fontWeight="600" flexShrink={0}>
            {timeAgo(entry.inserted_at)}
          </Text>
        </HStack>

        {/* Status row */}
        <HStack spacing={1} mb={3}>
          <Box
            w="7px"
            h="7px"
            borderRadius="full"
            bg={statusDot[entry.status] ?? "#B0AA9E"}
            flexShrink={0}
          />
          <Text fontSize="10px" fontWeight="700" textTransform="uppercase" letterSpacing="0.1em" color="gray.600">
            {statusLabel[entry.status] ?? entry.status}
          </Text>
        </HStack>

        {/* Patient name */}
        <Text fontWeight="700" fontSize="sm" mb={0.5} noOfLines={1}>
          {entry.patient?.name ?? "Unknown Patient"}
        </Text>

        {/* Department */}
        {entry.department && (
          <Text fontSize="11px" fontWeight="600" color="gray.500" mb={2}>
            {entry.department.name}
          </Text>
        )}

        {/* Chief complaint */}
        {entry.chief_complaint && (
          <Text fontSize="12px" color="gray.700" noOfLines={2} mb={2} lineHeight="1.4">
            {entry.chief_complaint}
          </Text>
        )}

        {/* Red flag */}
        {entry.red_flag_details && (
          <HStack
            spacing={1}
            bg="#FFF0F0"
            border="1px solid"
            borderColor="#FFCCCC"
            p={2}
            mb={2}
          >
            <Text fontSize="10px">⚠</Text>
            <Text fontSize="11px" color="#CC0000" fontWeight="600" noOfLines={1}>
              {entry.red_flag_details}
            </Text>
          </HStack>
        )}

        {/* Chronic conditions */}
        {(entry.patient?.chronic_conditions ?? []).length > 0 && (
          <HStack spacing={1} flexWrap="wrap" mb={2}>
            {entry.patient!.chronic_conditions.slice(0, 3).map((c) => (
              <Box
                key={c}
                bg="gray.100"
                border="1px solid"
                borderColor="gray.300"
                px="6px"
                py="1px"
                fontSize="9px"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.08em"
                borderRadius="2px"
              >
                {c}
              </Box>
            ))}
          </HStack>
        )}

        <Box flex={1} />

        {/* Footer */}
        <Flex justify="space-between" align="center" mt={3} pt={3} borderTop="1px solid" borderColor="gray.200">
          <Text fontSize="10px" fontWeight="600" color="gray.400">
            {entry.patient?.phone_number ?? "—"}
          </Text>
          {entry.estimated_wait_time != null && entry.status === "waiting" && (
            <Text fontSize="10px" fontWeight="700" color={isCritical ? "#E50000" : "gray.500"}>
              {entry.estimated_wait_time === 0 ? "Immediate" : `~${entry.estimated_wait_time}m`}
            </Text>
          )}
          <Text fontSize="10px" fontWeight="700" color="neo.blue" textTransform="uppercase" letterSpacing="0.06em">
            View →
          </Text>
        </Flex>
      </Box>
    </Box>
  );
}
