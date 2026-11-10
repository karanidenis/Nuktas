import { Grid, Box, Text, HStack } from "@chakra-ui/react";
import type { QueueStats } from "../types";

const cards = [
  { key: "waiting", label: "Waiting", hint: "Awaiting assessment", color: "#1261A0", bg: "#EFF6FF", icon: "◷" },
  { key: "checked_in", label: "Checked in", hint: "Ready at the desk", color: "#6D5BD0", bg: "#F5F3FF", icon: "✓" },
  { key: "in_progress", label: "In care", hint: "With a clinician", color: "#23856D", bg: "#ECFDF5", icon: "+" },
  { key: "critical", label: "Critical", hint: "Needs immediate review", color: "#C93636", bg: "#FFF1F2", icon: "!" },
] as const;

export function StatsBar({ stats }: { stats: QueueStats }) {
  return (
    <Grid templateColumns={{ base: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }} gap={3} mb={6}>
      {cards.map((card) => (
        <Box key={card.key} bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={4} boxShadow="xs">
          <HStack justify="space-between" align="flex-start">
            <Box>
              <Text fontSize="sm" color="gray.600" fontWeight="600">{card.label}</Text>
              <Text fontSize="3xl" color="gray.900" fontWeight="750" lineHeight="1.1" mt={1}>{stats[card.key]}</Text>
            </Box>
            <Box w="38px" h="38px" borderRadius="lg" bg={card.bg} color={card.color} display="grid" placeItems="center" fontSize="lg" fontWeight="800">
              {card.icon}
            </Box>
          </HStack>
          <Text fontSize="xs" color="gray.400" mt={3}>{card.hint}</Text>
        </Box>
      ))}
    </Grid>
  );
}
