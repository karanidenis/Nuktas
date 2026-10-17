import { Box, VStack, HStack, Text, Spinner } from "@chakra-ui/react";
import { useState, useEffect, useCallback } from "react";

interface DeptLoad {
  dept_id: string;
  name: string;
  code: string;
  active: number;
  critical: number;
  avg_historical_load: number;
  risk: "low" | "moderate" | "high" | "critical";
}

interface LoadData {
  generated_at: string;
  departments: DeptLoad[];
  narrative: string;
}

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

const riskConfig = {
  critical: { color: "#E50000", bg: "#FFF0F0", label: "CRIT",  dot: "#E50000" },
  high:     { color: "#FF6300", bg: "#FFF5EE", label: "HIGH",  dot: "#FF6300" },
  moderate: { color: "#F59B00", bg: "#FFFBEB", label: "MOD",   dot: "#F59B00" },
  low:      { color: "#009944", bg: "#F0FFF4", label: "LOW",   dot: "#009944" },
};

function RiskBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <Box w="full" h="3px" bg="gray.200" borderRadius="0">
      <Box
        h="full"
        w={`${pct}%`}
        bg={pct > 75 ? "#E50000" : pct > 50 ? "#F59B00" : "#009944"}
        transition="width 0.3s ease"
      />
    </Box>
  );
}

export function LoadPrediction({ clinicId, token }: Props) {
  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetch_ = useCallback(async () => {
    if (!clinicId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/clinics/${clinicId}/load-prediction`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, token]);

  useEffect(() => {
    fetch_();
    // Refresh every 5 minutes
    const id = setInterval(fetch_, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetch_]);

  const maxActive = data ? Math.max(...data.departments.map((d) => d.active), 1) : 1;

  return (
    <Box borderBottom="2px solid" borderColor="neo.black">
      {/* Header */}
      <HStack
        px={4}
        py={3}
        justify="space-between"
        cursor="pointer"
        onClick={() => setExpanded((v) => !v)}
        _hover={{ bg: "rgba(0,0,0,0.02)" }}
        userSelect="none"
      >
        <HStack spacing={2}>
          <Text fontSize="9px" fontWeight="800" textTransform="uppercase" letterSpacing="0.14em" color="gray.400">
            Load Forecast
          </Text>
          {loading && <Spinner size="xs" color="neo.blue" />}
        </HStack>
        <HStack spacing={1}>
          {data && (
            <Text fontSize="9px" color="gray.400" fontFamily="mono">
              {new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
          <Text fontSize="10px" color="gray.400">{expanded ? "▲" : "▼"}</Text>
        </HStack>
      </HStack>

      {expanded && (
        <Box px={4} pb={4}>
          {error ? (
            <Text fontSize="10px" color="#E50000" fontWeight="600">{error}</Text>
          ) : !data ? (
            <Text fontSize="10px" color="gray.400">Loading forecast…</Text>
          ) : (
            <VStack spacing={3} align="stretch">
              {/* AI Narrative */}
              <Box
                bg="white"
                border="1.5px solid"
                borderColor="gray.200"
                p={3}
                position="relative"
              >
                <Box
                  position="absolute"
                  top="-1px"
                  left={0}
                  w="30px"
                  h="2px"
                  bg="#0047FF"
                />
                <Text fontSize="9px" fontWeight="800" color="#0047FF" textTransform="uppercase" letterSpacing="0.1em" mb={1}>
                  AI Analysis
                </Text>
                <Text fontSize="10px" color="gray.600" lineHeight="1.6" fontWeight="500">
                  {data.narrative}
                </Text>
              </Box>

              {/* Department risk list */}
              <VStack spacing={1} align="stretch">
                {data.departments
                  .filter((d) => d.active > 0 || d.risk !== "low")
                  .slice(0, 6)
                  .map((dept) => {
                    const cfg = riskConfig[dept.risk] ?? riskConfig.low;
                    return (
                      <Box
                        key={dept.dept_id}
                        bg={cfg.bg}
                        border="1.5px solid"
                        borderColor={cfg.color}
                        px={2}
                        py="6px"
                      >
                        <HStack justify="space-between" mb="3px">
                          <HStack spacing={1}>
                            <Box w="5px" h="5px" bg={cfg.dot} flexShrink={0} />
                            <Text fontSize="10px" fontWeight="700" color="#0A0A0A" noOfLines={1}>
                              {dept.name}
                            </Text>
                          </HStack>
                          <HStack spacing={2}>
                            {dept.critical > 0 && (
                              <Text fontSize="9px" fontWeight="800" color="#E50000">
                                {dept.critical}⚠
                              </Text>
                            )}
                            <Box
                              bg={cfg.color}
                              color="white"
                              px="5px"
                              py="1px"
                              fontSize="8px"
                              fontWeight="800"
                              letterSpacing="0.08em"
                            >
                              {cfg.label}
                            </Box>
                          </HStack>
                        </HStack>
                        <RiskBar value={dept.active} max={maxActive} />
                        <HStack justify="space-between" mt="3px">
                          <Text fontSize="8px" color="gray.500" fontFamily="mono">
                            {dept.active} active
                          </Text>
                          <Text fontSize="8px" color="gray.400" fontFamily="mono">
                            avg {dept.avg_historical_load}
                          </Text>
                        </HStack>
                      </Box>
                    );
                  })}
              </VStack>

              {/* Refresh button */}
              <Box
                as="button"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); fetch_(); }}
                fontSize="9px"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.1em"
                color="gray.400"
                textAlign="center"
                py={1}
                border="1.5px solid"
                borderColor="gray.200"
                bg="white"
                cursor="pointer"
                _hover={{ borderColor: "#0047FF", color: "#0047FF" }}
                w="full"
              >
                {loading ? "Refreshing…" : "↺ Refresh Forecast"}
              </Box>
            </VStack>
          )}
        </Box>
      )}
    </Box>
  );
}
