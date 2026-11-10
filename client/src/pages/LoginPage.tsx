import { Box, VStack, HStack, Text, Input, Button, FormControl, FormLabel, Badge, SimpleGrid } from "@chakra-ui/react";
import { useState } from "react";

interface Props { onLogin: (email: string, password: string) => Promise<void>; loading: boolean; error: string | null; }

export function LoginPage({ onLogin, loading, error }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const chooseDemo = (value: string) => { setEmail(value); setPassword("password123"); };

  return (
    <Box minH="100vh" bg="neo.bg" display="grid" gridTemplateColumns={{ base: "1fr", lg: "1.05fr .95fr" }}>
      <Box bg="linear-gradient(145deg, #0B3B60 0%, #1261A0 55%, #0F766E 120%)" color="white" p={{ base: 8, md: 12, xl: 16 }} display={{ base: "none", lg: "flex" }} flexDirection="column" justifyContent="space-between" position="relative" overflow="hidden">
        <Box position="absolute" w="420px" h="420px" borderRadius="full" border="80px solid rgba(255,255,255,.04)" right="-110px" top="-100px" />
        <HStack spacing={3} position="relative"><Box w="42px" h="42px" borderRadius="xl" bg="white" color="blue.700" display="grid" placeItems="center" fontWeight="900" fontSize="xl">N</Box><Box><Text fontSize="lg" fontWeight="800">Nuktas</Text><Text fontSize="xs" color="whiteAlpha.700">Clinical triage coordination</Text></Box></HStack>
        <Box position="relative" maxW="560px">
          <Badge bg="rgba(255,255,255,.14)" color="white" mb={5} textTransform="none">SATS-grounded clinical workflow</Badge>
          <Text fontSize={{ lg: "4xl", xl: "5xl" }} fontWeight="800" lineHeight="1.08" letterSpacing="-.04em">The right patient.<br />The right priority.<br />A clinician always decides.</Text>
          <Text mt={6} maxW="500px" color="whiteAlpha.800" fontSize="md" lineHeight="1.7">Sourced priority recommendations and a clear audit trail help clinical teams act faster without handing decisions to a model.</Text>
          <SimpleGrid columns={3} gap={3} mt={8}>
            {[{ value: "SATS", label: "Grounded scoring" }, { value: "8", label: "Governed MCP tools" }, { value: "100%", label: "Human approval" }].map((item) => <Box key={item.value} bg="rgba(255,255,255,.1)" border="1px solid rgba(255,255,255,.16)" borderRadius="xl" p={4}><Text fontSize="lg" fontWeight="800">{item.value}</Text><Text fontSize="xs" color="whiteAlpha.700" mt={1}>{item.label}</Text></Box>)}
          </SimpleGrid>
        </Box>
        <Text fontSize="xs" color="whiteAlpha.500" position="relative">Nairobi, Kenya • Privacy-first clinical infrastructure</Text>
      </Box>

      <Box display="flex" alignItems="center" justifyContent="center" p={{ base: 5, md: 10 }}>
        <VStack align="stretch" spacing={6} w="full" maxW="430px">
          <HStack spacing={3} display={{ base: "flex", lg: "none" }}><Box w="40px" h="40px" borderRadius="xl" bg="neo.blue" color="white" display="grid" placeItems="center" fontWeight="900">N</Box><Box><Text fontWeight="800">Nuktas</Text><Text fontSize="xs" color="gray.500">Clinical triage coordination</Text></Box></HStack>
          <Box><Text fontSize="3xl" fontWeight="800" color="gray.900" letterSpacing="-.03em">Welcome back</Text><Text fontSize="sm" color="gray.500" mt={2}>Sign in to your secure clinic workspace.</Text></Box>

          {error && <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="lg" p={3}><Text color="red.700" fontSize="sm" fontWeight="650">{error}</Text></Box>}

          <form onSubmit={async (event) => { event.preventDefault(); await onLogin(email, password); }}>
            <VStack spacing={4} align="stretch">
              <FormControl><FormLabel fontSize="sm" color="gray.700">Work email</FormLabel><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.org" size="lg" required autoComplete="email" /></FormControl>
              <FormControl><FormLabel fontSize="sm" color="gray.700">Password</FormLabel><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" size="lg" required autoComplete="current-password" /></FormControl>
              <Button type="submit" size="lg" bg="neo.blue" color="white" _hover={{ bg: "blue.700" }} isLoading={loading} loadingText="Signing in…" mt={1}>Sign in securely</Button>
            </VStack>
          </form>

          <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={4} boxShadow="xs">
            <HStack justify="space-between" mb={3}><Text fontSize="sm" fontWeight="700" color="gray.800">Demo access</Text><Badge bg="blue.50" color="blue.700">Finalist demo</Badge></HStack>
            <VStack align="stretch" spacing={2}>
              {[{ email: "admin@nairobi.clinic", role: "Administrator" }, { email: "staff@nairobi.clinic", role: "Triage nurse" }, { email: "doctor@nairobi.clinic", role: "Clinician" }].map((item) => (
                <HStack key={item.email} as="button" type="button" onClick={() => chooseDemo(item.email)} justify="space-between" textAlign="left" px={3} py={2.5} borderRadius="lg" _hover={{ bg: "gray.50" }}>
                  <Box><Text fontSize="sm" fontWeight="650" color="gray.700">{item.role}</Text><Text fontSize="xs" color="gray.400">{item.email}</Text></Box><Text fontSize="xs" color="blue.600" fontWeight="700">Use account</Text>
                </HStack>
              ))}
            </VStack>
          </Box>
          <Text textAlign="center" fontSize="xs" color="gray.400">For authorised clinical personnel only.</Text>
        </VStack>
      </Box>
    </Box>
  );
}
