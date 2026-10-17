import { Box, HStack, Text, Button, VStack } from "@chakra-ui/react";
import type { QueueEntry } from "../types";

interface Props {
  alerts: QueueEntry[];
  onAcknowledge: (id: string) => void;
}

export function CriticalAlertBanner({ alerts, onAcknowledge }: Props) {
  if (alerts.length === 0) return null;

  return (
    <VStack spacing={2} mb={5} align="stretch">
      {alerts.map((entry) => (
        <Box
          key={entry.id}
          bg="#E50000"
          border="2px solid"
          borderColor="#0A0A0A"
          boxShadow="4px 4px 0 #0A0A0A"
          p={0}
          overflow="hidden"
          sx={{
            animation: "none",
          }}
        >
          {/* Stripe header bar */}
          <Box
            bg="#0A0A0A"
            px={4}
            py="6px"
            sx={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #0A0A0A 0px, #0A0A0A 10px, #E50000 10px, #E50000 20px)",
            }}
          />

          <HStack px={4} py={3} justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <HStack spacing={3}>
              <Text
                fontWeight="800"
                fontSize="sm"
                color="white"
                textTransform="uppercase"
                letterSpacing="0.1em"
              >
                🚨 CRITICAL
              </Text>
              <Box
                bg="white"
                color="#E50000"
                px={2}
                py="2px"
                fontWeight="800"
                fontSize="xs"
                letterSpacing="0.06em"
                borderRadius="2px"
              >
                {entry.queue_number}
              </Box>
              <Text fontWeight="700" fontSize="sm" color="white">
                {entry.patient?.name ?? "Unknown Patient"}
              </Text>
              {entry.department && (
                <Text fontSize="xs" color="rgba(255,255,255,0.7)" fontWeight="600">
                  · {entry.department.name}
                </Text>
              )}
            </HStack>

            <HStack spacing={2}>
              {entry.chief_complaint && (
                <Text fontSize="xs" color="rgba(255,255,255,0.85)" fontStyle="italic" maxW="240px" noOfLines={1}>
                  "{entry.chief_complaint}"
                </Text>
              )}
              <Button
                size="xs"
                bg="white"
                color="#E50000"
                fontWeight="800"
                border="2px solid white"
                _hover={{ bg: "#FFE600", borderColor: "#0A0A0A", color: "#0A0A0A" }}
                onClick={() => onAcknowledge(entry.id)}
                flexShrink={0}
              >
                Acknowledge ✓
              </Button>
            </HStack>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
}
