import { Box, VStack, Text, HStack, Spinner } from "@chakra-ui/react";
import { useParams, Navigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { RecommendationCard } from "../components/triage/RecommendationCard";
import type { User } from "../types";

interface Props {
  token: string | null;
  user: User | null;
  onLogout: () => void;
}

export function TriageReviewPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  const { recommendations, loading, approve, reject } = useRecommendations(clinic_id, token, "pending,awaiting_approval");

  if (!token) return <Navigate to="/login" replace />;

  return (
    <Box minH="100vh" bg="#F5F0E8" p={6}>
      <VStack align="start" spacing={6} maxW="900px" mx="auto" w="full">
        <HStack justify="space-between" w="full">
          <Text fontSize="2xl" fontWeight="900">Triage review</Text>
          <Text fontSize="sm" color="gray.600">{recommendations.length} awaiting review</Text>
        </HStack>
        {loading && recommendations.length === 0 ? <Spinner /> : null}
        <VStack spacing={4} w="full">
          {recommendations.map((r) => (
            <RecommendationCard
              key={r.id}
              recommendation={r}
              onApprove={() => approve(r.id)}
              onReject={() => reject(r.id)}
            />
          ))}
        </VStack>
      </VStack>
    </Box>
  );
}
