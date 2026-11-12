import { Box, Grid, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from "@chakra-ui/react";
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
    <Box mb={5}><Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-.03em">Operations</Text><Text color="gray.600" fontSize="sm" mt={1}>Monitor care signals, demonstrate interoperability and inspect the governed agent trail.</Text></Box>
    <Tabs variant="enclosed-colored" colorScheme="blue" isLazy>
      <TabList overflowX="auto"><Tab flexShrink={0}>Live operations</Tab><Tab flexShrink={0}>Governance & audit</Tab><Tab flexShrink={0}>Capacity</Tab></TabList>
      <TabPanels>
        <TabPanel px={0} pt={5}><FinalistShowcase clinicId={clinic_id} token={token} /></TabPanel>
        <TabPanel px={0} pt={5}><Box mb={4} p={3} borderRadius="lg" bg="blue.50" color="blue.900" fontSize="sm">Agent runs and tool actions are traceability records. Patient priority decisions remain in Clinical review.</Box><Grid templateColumns={{ base: "1fr", xl: "1.1fr 1fr" }} gap={5} alignItems="start"><AgentRunsList clinicId={clinic_id} token={token} /><AuditLog clinicId={clinic_id} token={token} /></Grid></TabPanel>
        <TabPanel px={0} pt={5}><Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" overflow="hidden"><LoadPrediction clinicId={clinic_id} token={token} /></Box></TabPanel>
      </TabPanels>
    </Tabs>
  </AppShell>;
}
