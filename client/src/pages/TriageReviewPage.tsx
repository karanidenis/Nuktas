import { Badge, Box, Button, Grid, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { useParams, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useRecommendations } from "../hooks/useRecommendations";
import { AppShell } from "../components/AppShell";
import { RecommendationCard } from "../components/triage/RecommendationCard";
import type { User } from "../types";

interface Props { token: string | null; user: User | null; onLogout: () => void; }
export function TriageReviewPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>(); const { recommendations, loading, error, approve, reject } = useRecommendations(clinic_id, token, "pending,awaiting_approval");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!recommendations.length) return setSelectedId(null);
    if (!selectedId || !recommendations.some((item) => item.id === selectedId)) setSelectedId(recommendations[0].id);
  }, [recommendations, selectedId]);
  const selected = recommendations.find((item) => item.id === selectedId) || recommendations[0];
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell clinicId={clinic_id} user={user} onLogout={onLogout}>
    <HStack mb={6} justify="space-between" align={{ base: "flex-start", md: "center" }} flexDirection={{ base: "column", md: "row" }}><Box><Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-.03em">Clinical review</Text><Text fontSize="sm" color="gray.600" mt={1}>Review one patient at a time. Every approval or override is attributed and audited.</Text></Box>{recommendations.length > 0 && <Badge colorScheme="orange" px={3} py={1.5} borderRadius="full" textTransform="none">{recommendations.length} awaiting decision</Badge>}</HStack>
    {error && <Box mb={4} p={3} bg="red.50" color="red.800" borderRadius="lg">Could not load recommendations: {error}</Box>}
    {loading && recommendations.length === 0 ? <Spinner /> : recommendations.length === 0 ? <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" textAlign="center" py={16}><Text fontWeight="800">Review queue is clear</Text><Text fontSize="sm" color="gray.600" mt={1}>New recommendations will appear here. No queue changes are waiting.</Text></Box> : <Grid templateColumns={{ base: "1fr", xl: "290px minmax(0, 1fr)" }} gap={4} alignItems="start">
      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" overflow="hidden" position={{ xl: "sticky" }} top={{ xl: "92px" }}><Box px={4} py={3} borderBottom="1px solid" borderColor="gray.200"><Text fontSize="xs" fontWeight="800" color="gray.700" textTransform="uppercase">Review list</Text></Box><VStack align="stretch" spacing={0}>{recommendations.map((item, index) => <Button key={item.id} h="auto" py={3} px={4} borderRadius={0} justifyContent="stretch" variant="ghost" bg={item.id === selected?.id ? "blue.50" : "white"} borderLeft="3px solid" borderLeftColor={item.id === selected?.id ? "blue.500" : "transparent"} borderBottom={index < recommendations.length - 1 ? "1px solid" : "none"} borderBottomColor="gray.100" onClick={() => setSelectedId(item.id)}><Box textAlign="left" minW={0} w="full"><HStack justify="space-between"><Text fontSize="sm" fontWeight="800" noOfLines={1}>{item.patient?.name || "Unknown patient"}</Text><Badge colorScheme={item.recommended_urgency === "critical" ? "red" : item.recommended_urgency === "high" ? "orange" : "yellow"} fontSize="10px">{item.recommended_urgency}</Badge></HStack><Text fontSize="xs" color="gray.600" mt={1}>Queue {item.queue_entry?.queue_number || "—"} · TEWS {item.tews_score ?? "—"}</Text></Box></Button>)}</VStack></Box>
      {selected && <RecommendationCard key={selected.id} recommendation={selected} onApprove={(decision) => approve(selected.id, decision)} onReject={(decision) => reject(selected.id, decision)} />}
    </Grid>}
  </AppShell>;
}
