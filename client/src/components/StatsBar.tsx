import { Grid, Box, Text } from "@chakra-ui/react";
import type { QueueStats } from "../types";

interface StatProps {
  label: string;
  value: string | number;
  bg: string;
  color?: string;
  wide?: boolean;
}

function StatBox({ label, value, bg, color = "#0A0A0A", wide }: StatProps) {
  return (
    <Box
      bg={bg}
      border="2px solid"
      borderColor="neo.black"
      boxShadow="3px 3px 0 #0A0A0A"
      p={4}
      gridColumn={wide ? "span 2" : undefined}
      position="relative"
      overflow="hidden"
    >
      <Text
        fontSize="28px"
        fontWeight="800"
        lineHeight="1"
        color={color}
        fontFamily="mono"
        mb={1}
      >
        {value}
      </Text>
      <Text
        fontSize="9px"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="0.12em"
        color={color}
        opacity={0.7}
      >
        {label}
      </Text>
    </Box>
  );
}

export function StatsBar({ stats }: { stats: QueueStats }) {
  return (
    <Grid
      templateColumns={{ base: "repeat(3, 1fr)", md: "repeat(5, 1fr)" }}
      gap={3}
      mb={5}
    >
      <StatBox label="Total Queue"  value={stats.total}        bg="#FFFFFF" />
      <StatBox label="Waiting"      value={stats.waiting}      bg="#F5F0E8" />
      <StatBox label="In Progress"  value={stats.in_progress}  bg="#0047FF" color="#FFFFFF" />
      <StatBox label="Critical"     value={stats.critical}     bg={stats.critical > 0 ? "#E50000" : "#FFFFFF"} color={stats.critical > 0 ? "#FFFFFF" : "#0A0A0A"} />
      <StatBox label="Avg Wait"     value={stats.avg_wait > 0 ? `${stats.avg_wait}m` : "—"} bg="#FFE600" />
    </Grid>
  );
}
