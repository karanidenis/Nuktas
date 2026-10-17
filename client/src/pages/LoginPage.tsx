import { Box, VStack, HStack, Text, Input, Button, FormControl, FormLabel } from "@chakra-ui/react";
import { useState } from "react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function LoginPage({ onLogin, loading, error }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <Box minH="100vh" bg="#F5F0E8" display="flex" alignItems="stretch">
      {/* Left panel — branding */}
      <Box
        flex="1"
        bg="#0A0A0A"
        display={{ base: "none", lg: "flex" }}
        flexDirection="column"
        justifyContent="space-between"
        p={12}
        position="relative"
        overflow="hidden"
      >
        {/* Background grid pattern */}
        <Box
          position="absolute"
          inset={0}
          opacity={0.06}
          sx={{
            backgroundImage:
              "linear-gradient(#FFE600 1px, transparent 1px), linear-gradient(90deg, #FFE600 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Top */}
        <VStack align="flex-start" spacing={1} position="relative">
          <Box
            bg="#FFE600"
            border="2px solid #FFE600"
            px={3}
            py={1}
            display="inline-block"
          >
            <Text fontWeight="800" fontSize="sm" color="#0A0A0A" letterSpacing="0.1em" textTransform="uppercase">
              Nuktas
            </Text>
          </Box>
        </VStack>

        {/* Center content */}
        <VStack align="flex-start" spacing={6} position="relative">
          <Text
            fontSize="64px"
            fontWeight="800"
            lineHeight="1"
            color="white"
            letterSpacing="-0.02em"
          >
            Clinic
            <br />
            Queue
            <br />
            <Box as="span" color="#FFE600">System.</Box>
          </Text>

          <Box w="60px" h="4px" bg="#FFE600" />

          <Text fontSize="sm" color="rgba(255,255,255,0.5)" fontWeight="500" maxW="320px" lineHeight="1.6">
            AI-powered patient intake via voice call. Real-time triage and queue management for East African clinics.
          </Text>

          {/* Feature pills */}
          <VStack align="flex-start" spacing={2}>
            {[
              "🎙 Voice intake in Kiswahili & English",
              "⚡ Real-time queue updates across all staff",
              "🚨 Instant critical patient alerts",
            ].map((f) => (
              <HStack key={f} spacing={2}>
                <Box w="6px" h="6px" bg="#FFE600" flexShrink={0} />
                <Text fontSize="12px" color="rgba(255,255,255,0.6)" fontWeight="500">
                  {f}
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>

        {/* Bottom */}
        <Text fontSize="11px" color="rgba(255,255,255,0.25)" position="relative">
          Nairobi, Kenya · {new Date().getFullYear()}
        </Text>
      </Box>

      {/* Right panel — login form */}
      <Box
        flex="1"
        display="flex"
        flexDirection="column"
        justifyContent="center"
        px={{ base: 6, md: 16, lg: 24 }}
        py={12}
        bg="#F5F0E8"
        borderLeft={{ lg: "2px solid #0A0A0A" }}
      >
        <VStack align="stretch" spacing={8} maxW="360px" mx="auto" w="full">
          {/* Mobile logo */}
          <Box display={{ base: "block", lg: "none" }}>
            <Box bg="#0A0A0A" px={3} py={1} display="inline-block" mb={2}>
              <Text fontWeight="800" fontSize="sm" color="#FFE600" letterSpacing="0.1em" textTransform="uppercase">
                Nuktas
              </Text>
            </Box>
            <Text fontSize="xs" color="gray.500" fontWeight="600">
              Clinic Queue System
            </Text>
          </Box>

          <Box>
            <Text fontSize="28px" fontWeight="800" lineHeight="1.1" mb={1}>
              Sign In
            </Text>
            <Text fontSize="sm" color="gray.500" fontWeight="500">
              Access your clinic dashboard
            </Text>
          </Box>

          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <VStack spacing={4} align="stretch">
              {/* Error */}
              {error && (
                <Box
                  bg="white"
                  border="2px solid"
                  borderColor="#E50000"
                  boxShadow="3px 3px 0 #E50000"
                  p={3}
                >
                  <HStack spacing={2}>
                    <Text fontSize="sm" color="#E50000">⚠</Text>
                    <Text fontSize="sm" fontWeight="600" color="#E50000">
                      {error}
                    </Text>
                  </HStack>
                </Box>
              )}

              <FormControl>
                <FormLabel
                  fontSize="10px"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="0.12em"
                  color="gray.600"
                  mb={1}
                >
                  Email Address
                </FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@nairobi.clinic"
                  size="lg"
                  bg="white"
                  fontWeight="500"
                  required
                  autoComplete="email"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="10px"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="0.12em"
                  color="gray.600"
                  mb={1}
                >
                  Password
                </FormLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  size="lg"
                  bg="white"
                  fontWeight="500"
                  required
                  autoComplete="current-password"
                />
              </FormControl>

              <Button
                type="submit"
                bg="#0A0A0A"
                color="#FFE600"
                borderColor="#0A0A0A"
                size="lg"
                w="full"
                isLoading={loading}
                loadingText="Signing in…"
                mt={2}
                fontSize="xs"
                letterSpacing="0.12em"
                _hover={{
                  bg: "#0A0A0A",
                  color: "#FFE600",
                  boxShadow: "5px 5px 0 #0A0A0A",
                  transform: "translate(-2px,-2px)",
                }}
              >
                Sign In →
              </Button>
            </VStack>
          </form>

          {/* Demo credentials */}
          <Box
            border="2px solid"
            borderColor="gray.300"
            p={4}
            bg="white"
          >
            <Text
              fontSize="9px"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="0.14em"
              color="gray.400"
              mb={3}
            >
              Demo Credentials
            </Text>
            {[
              { email: "admin@nairobi.clinic",  role: "Admin"  },
              { email: "staff@nairobi.clinic",  role: "Staff"  },
              { email: "doctor@nairobi.clinic", role: "Doctor" },
            ].map(({ email: e, role }) => (
              <HStack
                key={e}
                justify="space-between"
                py={2}
                borderBottom="1px solid"
                borderColor="gray.100"
                _last={{ borderBottom: "none" }}
                cursor="pointer"
                onClick={() => { setEmail(e); setPassword("password123"); }}
                _hover={{ bg: "gray.50" }}
                px={1}
              >
                <Box>
                  <Text fontSize="11px" fontWeight="700" fontFamily="mono">{e}</Text>
                  <Text fontSize="10px" color="gray.400">password123</Text>
                </Box>
                <Box
                  bg="gray.100"
                  border="1px solid"
                  borderColor="gray.300"
                  px={2}
                  py="2px"
                  fontSize="9px"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  borderRadius="2px"
                >
                  {role}
                </Box>
              </HStack>
            ))}
          </Box>
        </VStack>
      </Box>
    </Box>
  );
}
