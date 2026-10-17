import { Box, VStack, Text, Button, HStack } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { useRecommendations } from "../../hooks/useRecommendations";
import { RecommendationCard } from "./RecommendationCard";
import { AuditLog } from "./AuditLog";
import { AgentRunsList } from "./AgentRunsList";

interface Props {
  clinicId: string | undefined;
  token: string | null;
}

export function NuktasTriagePanel({ clinicId, token }: Props) {
  const { recommendations, approve, reject } = useRecommendations(clinicId, token, "pending,awaiting_approval");

  return (
    <Box>
      <VStack align="start" spacing={4} w="full">
        <HStack justify="space-between" w="full">
          <Text fontWeight="800" fontSize="lg">Nuktas Triage Assistant</Text>
          <Button as={RouterLink} to={`/triage/review/${clinicId}`} size="sm" variant="outline">
            Open review board
          </Button>
        </HStack>
        {recommendations.slice(0, 2).map((r) => (
          <RecommendationCard
            key={r.id}
            recommendation={r}
            onApprove={() => approve(r.id)}
            onReject={() => reject(r.id)}
          />
        ))}
        {recommendations.length > 2 ? (
          <Text fontSize="xs" color="gray.600">+{recommendations.length - 2} more awaiting review</Text>
        ) : null}
        <HStack spacing={4} w="full" align="start">
          <AuditLog clinicId={clinicId} token={token} />
          <AgentRunsList clinicId={clinicId} token={token} />
        </HStack>
      </VStack>
    </Box>
  );
}
