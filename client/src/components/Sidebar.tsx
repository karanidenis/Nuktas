import { Box, VStack, HStack, Text, Divider } from "@chakra-ui/react";
import type { QueueEntry, QueueStats, UrgencyTier } from "../types";
import { useMemo } from "react";
import { LoadPrediction } from "./LoadPrediction";

interface DeptStat {
  name: string;
  code: string;
  count: number;
  critical: number;
}

interface Props {
  stats: QueueStats | null;
  queue: QueueEntry[];
  filterUrgency: string;
  filterStatus: string;
  onFilterUrgency: (v: string) => void;
  onFilterStatus: (v: string) => void;
  clinicId?: string;
  token?: string | null;
}

const urgencyColors: Record<UrgencyTier, string> = {
  critical: "#E50000",
  high:     "#FF6300",
  medium:   "#F59B00",
  low:      "#009944",
};

const urgencyLabels: { value: string; label: string; color: string }[] = [
  { value: "all",      label: "All Urgency",  color: "#0A0A0A" },
  { value: "critical", label: "Critical",     color: "#E50000" },
  { value: "high",     label: "High",         color: "#FF6300" },
  { value: "medium",   label: "Medium",       color: "#F59B00" },
  { value: "low",      label: "Low",          color: "#009944" },
];

const statusOptions = [
  { value: "active",    label: "Active" },
  { value: "all",       label: "All" },
  { value: "completed", label: "Completed" },
];

function FilterChip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      bg={active ? (color ?? "#0A0A0A") : "white"}
      color={active ? "white" : "#0A0A0A"}
      border="2px solid"
      borderColor={active ? (color ?? "#0A0A0A") : "#D4CFC3"}
      px={3}
      py="5px"
      fontSize="10px"
      fontWeight="700"
      textTransform="uppercase"
      letterSpacing="0.08em"
      cursor="pointer"
      borderRadius="2px"
      transition="all 0.08s ease"
      _hover={{
        borderColor: color ?? "#0A0A0A",
        boxShadow: `2px 2px 0 ${color ?? "#0A0A0A"}`,
      }}
      display="block"
      w="full"
      textAlign="left"
    >
      {active && <Box as="span" mr={1}>▶</Box>}
      {label}
    </Box>
  );
}

export function Sidebar({ stats, queue, filterUrgency, filterStatus, onFilterUrgency, onFilterStatus, clinicId, token }: Props) {
  // Compute per-department counts from queue
  const deptStats = useMemo<DeptStat[]>(() => {
    const map = new Map<string, DeptStat>();
    for (const e of queue) {
      if (!e.department) continue;
      const key = e.department.id;
      if (!map.has(key)) {
        map.set(key, { name: e.department.name, code: e.department.code, count: 0, critical: 0 });
      }
      const d = map.get(key)!;
      d.count++;
      if (e.urgency_tier === "critical") d.critical++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [queue]);

  return (
    <Box
      w="260px"
      flexShrink={0}
      bg="#F5F0E8"
      borderRight="2px solid"
      borderColor="neo.black"
      display="flex"
      flexDirection="column"
      h="100%"
      overflowY="auto"
    >
      {/* Stats */}
      <Box p={4} borderBottom="2px solid" borderColor="neo.black">
        <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={3}>
          Live Stats
        </Text>

        {stats ? (
          <VStack spacing={0} align="stretch">
            {[
              { label: "Total",       value: stats.total,        color: "#0A0A0A" },
              { label: "Waiting",     value: stats.waiting,      color: "#5A5650" },
              { label: "In Progress", value: stats.in_progress,  color: "#0047FF" },
              { label: "Critical",    value: stats.critical,     color: stats.critical > 0 ? "#E50000" : "#5A5650" },
            ].map(({ label, value, color }) => (
              <HStack key={label} justify="space-between" py={2} borderBottom="1px solid" borderColor="gray.200">
                <Text fontSize="11px" fontWeight="600" color="gray.600" textTransform="uppercase" letterSpacing="0.08em">
                  {label}
                </Text>
                <Text fontSize="18px" fontWeight="800" fontFamily="mono" color={color} lineHeight="1">
                  {value}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : (
          <Text fontSize="xs" color="gray.400">Loading…</Text>
        )}
      </Box>

      {/* Departments */}
      {deptStats.length > 0 && (
        <Box p={4} borderBottom="2px solid" borderColor="neo.black">
          <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={3}>
            Departments
          </Text>
          <VStack spacing={1} align="stretch">
            {deptStats.map((d) => (
              <HStack
                key={d.code}
                justify="space-between"
                px={2}
                py="7px"
                bg="white"
                border="1.5px solid"
                borderColor="gray.200"
              >
                <HStack spacing={2}>
                  {d.critical > 0 && (
                    <Box w="6px" h="6px" borderRadius="full" bg="#E50000" flexShrink={0} />
                  )}
                  <Text fontSize="11px" fontWeight="600" noOfLines={1}>
                    {d.name}
                  </Text>
                </HStack>
                <Box
                  bg={d.count > 0 ? "#0A0A0A" : "gray.200"}
                  color={d.count > 0 ? "white" : "gray.500"}
                  fontFamily="mono"
                  fontSize="10px"
                  fontWeight="700"
                  px={2}
                  py="1px"
                  borderRadius="2px"
                  flexShrink={0}
                >
                  {d.count}
                </Box>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Feature 4: Load Prediction */}
      <LoadPrediction clinicId={clinicId} token={token ?? null} />

      {/* Urgency filter */}
      <Box p={4} borderBottom="2px solid" borderColor="neo.black">
        <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={3}>
          Filter by Urgency
        </Text>
        <VStack spacing={1} align="stretch">
          {urgencyLabels.map(({ value, label, color }) => (
            <FilterChip
              key={value}
              active={filterUrgency === value}
              label={label}
              color={value === "all" ? undefined : color}
              onClick={() => onFilterUrgency(value)}
            />
          ))}
        </VStack>
      </Box>

      {/* Status filter */}
      <Box p={4}>
        <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400" mb={3}>
          Filter by Status
        </Text>
        <VStack spacing={1} align="stretch">
          {statusOptions.map(({ value, label }) => (
            <FilterChip
              key={value}
              active={filterStatus === value}
              label={label}
              onClick={() => onFilterStatus(value)}
            />
          ))}
        </VStack>
      </Box>
    </Box>
  );
}
