import { Box, VStack, HStack, Text, Button, Badge, Stack, Divider } from "@chakra-ui/react";
import type { Recommendation } from "../../types/triage";

interface Props {
  recommendation: Recommendation;
  onApprove: (note?: string) => Promise<any>;
  onReject: (note?: string) => Promise<any>;
}

const urgencyColour: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#16A34A",
};

export function RecommendationCard({ recommendation, onApprove, onReject }: Props) {
  const handleApprove = async () => {
    await onApprove("Approved by triage nurse");
  };
  const handleReject = async () => {
    await onReject("Not urgent for escalation");
  };

  return (
    <Box bg="white" border="2px solid" borderColor="#111" p={4} borderRadius="6px">
      <VStack align="start" spacing={3}>
        <HStack justify="space-between" w="full">
          <HStack spacing={3}>
            <Badge
              bg={urgencyColour[recommendation.recommended_urgency] || "#111"}
              color="white"
              fontWeight="700"
            >
              {recommendation.sats_colour.toUpperCase()} • {recommendation.recommended_urgency}
            </Badge>
            <Text fontSize="xs" color="gray.600">
              TEWS {recommendation.tews_score ?? "—"} • Target {recommendation.target_minutes ?? "—"} min
            </Text>
          </HStack>
          <Badge colorScheme={recommendation.status === "awaiting_approval" ? "orange" : "gray"}>
            {recommendation.status}
          </Badge>
        </HStack>
        <Text fontWeight="700">{recommendation.patient?.name ?? "Unknown patient"}</Text>
        <Text fontSize="sm" color="gray.700">{recommendation.rationale}</Text>
        {recommendation.missing_data?.length ? (
          <Text fontSize="xs" color="orange.600">
            Missing: {recommendation.missing_data.join(", ")}
          </Text>
        ) : null}
        <Divider />
        <Stack direction={{ base: "column", sm: "row" }} spacing={3} w="full">
          <Button colorScheme="red" onClick={handleApprove} isDisabled={recommendation.status === "applied"}>
            Approve & Apply
          </Button>
          <Button variant="outline" onClick={handleReject}>
            Reject
          </Button>
        </Stack>
      </VStack>
    </Box>
  );
}
