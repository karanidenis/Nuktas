import { Box, HStack, Text, Button, VStack } from "@chakra-ui/react";
import type { QueueEntry } from "../types";

interface Props { alerts: QueueEntry[]; onAcknowledge: (id: string) => void; }

export function CriticalAlertBanner({ alerts, onAcknowledge }: Props) {
  if (alerts.length === 0) return null;
  return (
    <VStack spacing={3} mb={6} align="stretch">
      {alerts.map((entry) => (
        <Box key={entry.id} bg="red.50" border="1px solid" borderColor="red.200" borderLeft="5px solid" borderLeftColor="red.500" borderRadius="xl" p={4} boxShadow="xs">
          <HStack justify="space-between" align={{ base: "flex-start", md: "center" }} flexDirection={{ base: "column", md: "row" }} gap={3}>
            <HStack spacing={3} align="flex-start">
              <Box w="38px" h="38px" flexShrink={0} borderRadius="full" bg="red.500" color="white" display="grid" placeItems="center" fontSize="lg" fontWeight="800">!</Box>
              <Box>
                <HStack spacing={2} flexWrap="wrap">
                  <Text color="red.700" fontWeight="800">Immediate clinical review</Text>
                  <Text bg="white" border="1px solid" borderColor="red.200" borderRadius="md" px={2} py={0.5} fontFamily="mono" fontSize="xs" fontWeight="700">{entry.queue_number}</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="700" color="gray.900" mt={1}>{entry.patient?.name ?? "Unknown patient"}</Text>
                <Text fontSize="sm" color="gray.600" mt={0.5}>{entry.chief_complaint || "Critical triage flag"}{entry.department ? ` • ${entry.department.name}` : ""}</Text>
              </Box>
            </HStack>
            <Button size="sm" bg="red.600" color="white" _hover={{ bg: "red.700" }} onClick={() => onAcknowledge(entry.id)} flexShrink={0}>Acknowledge alert</Button>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
}
