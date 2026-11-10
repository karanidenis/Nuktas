import { Box, Spinner, Text, VStack } from "@chakra-ui/react";
import { useParams, Navigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { AppShell } from "../components/AppShell";
import { RecommendationCard } from "../components/triage/RecommendationCard";
import type { User } from "../types";

interface Props { token: string | null; user: User | null; onLogout: () => void; }
export function TriageReviewPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>(); const { recommendations, loading, error, approve, reject } = useRecommendations(clinic_id, token, "pending,awaiting_approval");
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell clinicId={clinic_id} user={user} onLogout={onLogout}>
    <Box mb={6}><Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-.03em">Clinical review</Text><Text fontSize="sm" color="gray.500" mt={1}>Validate sourced SATS recommendations before they affect the patient queue.</Text></Box>
    {error && <Box mb={4} p={3} bg="red.50" color="red.800" borderRadius="lg">Could not load recommendations: {error}</Box>}
    {loading && recommendations.length === 0 ? <Spinner /> : recommendations.length === 0 ? <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" textAlign="center" py={16}><Text fontWeight="800">Review queue is clear</Text><Text fontSize="sm" color="gray.500" mt={1}>New agent recommendations will appear here.</Text></Box> : <VStack spacing={4} align="stretch">{recommendations.map((item) => <RecommendationCard key={item.id} recommendation={item} onApprove={(note) => approve(item.id, note)} onReject={(note) => reject(item.id, note)} />)}</VStack>}
  </AppShell>;
}
