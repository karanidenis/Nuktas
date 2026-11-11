import { Box, Grid, HStack, Text } from "@chakra-ui/react";
import { Navigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AuditLog } from "../components/triage/AuditLog";
import { AgentRunsList } from "../components/triage/AgentRunsList";
import { LoadPrediction } from "../components/LoadPrediction";
import { FinalistShowcase } from "../components/triage/FinalistShowcase";
import type { User } from "../types";

interface Props { token: string | null; user: User | null; onLogout: () => void; }
export function ActivityPage({ token, user, onLogout }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell clinicId={clinic_id} user={user} onLogout={onLogout}>
    <Box mb={6}><Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-.03em">Activity & audit</Text><Text color="gray.500" fontSize="sm" mt={1}>Inspect agent runs, tool activity and operational signals.</Text></Box>
    <HStack mb={4} p={3} borderRadius="lg" bg="blue.50" align="flex-start"><Text color="blue.700" fontWeight="800">i</Text><Text fontSize="sm" color="blue.800">This workspace is for traceability. Clinical approvals happen in Clinical review.</Text></HStack>
    <FinalistShowcase clinicId={clinic_id} token={token} />
    <Grid mt={5} templateColumns={{ base: "1fr", xl: "1.1fr 1fr" }} gap={5} alignItems="start"><AgentRunsList clinicId={clinic_id} token={token} /><AuditLog clinicId={clinic_id} token={token} /><Box gridColumn={{ xl: "1 / -1" }} bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" overflow="hidden"><LoadPrediction clinicId={clinic_id} token={token} /></Box></Grid>
  </AppShell>;
}
