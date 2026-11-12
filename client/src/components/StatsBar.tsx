import { Grid, Box, Text, HStack } from "@chakra-ui/react";
import type { QueueStats } from "../types";

const cards = [
  { key: "waiting", label: "Waiting", color: "blue.700" },
  { key: "checked_in", label: "Checked in", color: "purple.700" },
  { key: "in_progress", label: "In care", color: "green.700" },
  { key: "critical", label: "Critical", color: "red.700" },
] as const;

export function StatsBar({ stats }: { stats: QueueStats }) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" mb={4} boxShadow="xs">
    <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}>
      {cards.map((card) => (
        <HStack key={card.key} px={4} py={3} spacing={3} borderLeft="1px solid" borderColor="gray.200" _first={{ borderLeft: "none" }}>
          <Text fontSize="2xl" fontWeight="850" color={card.color} minW="30px">{stats[card.key]}</Text><Text fontSize="sm" color="gray.700" fontWeight="700">{card.label}</Text>
        </HStack>
      ))}
    </Grid>
    </Box>
  );
}
