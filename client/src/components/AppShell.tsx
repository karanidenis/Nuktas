import { Box, Button, HStack, Menu, MenuButton, MenuItem, MenuList, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { User } from "../types";

interface Props { clinicId?: string; user: User | null; onLogout: () => void; connected?: boolean; children: ReactNode; }
const nav = [
  { key: "queue", label: "Patient queue", glyph: "Q", path: (id: string) => `/dashboard/${id}` },
  { key: "review", label: "Clinical review", glyph: "R", path: (id: string) => `/triage/review/${id}` },
  { key: "activity", label: "Operations", glyph: "O", path: (id: string) => `/activity/${id}` },
];

export function AppShell({ clinicId, user, onLogout, connected, children }: Props) {
  const location = useLocation(); const id = clinicId || user?.clinic_id || "";
  return <Box minH="100vh" bg="neo.bg">
    <Box as="header" h="68px" px={{ base: 4, md: 6 }} bg="white" borderBottom="1px solid" borderColor="gray.200" position="sticky" top={0} zIndex={100} display="flex" alignItems="center">
      <HStack w="full" justify="space-between"><HStack spacing={3}><Box w="38px" h="38px" borderRadius="xl" bg="neo.blue" color="white" display="grid" placeItems="center" fontWeight="800">N</Box><Box><Text fontWeight="800" lineHeight="1.1">Nuktas</Text><Text fontSize="xs" color="gray.500">Nairobi Central Clinic</Text></Box></HStack>
        <HStack spacing={3}>{connected !== undefined && <HStack display={{ base: "none", sm: "flex" }} px={3} py={1.5} borderRadius="full" bg={connected ? "green.50" : "yellow.50"}><Box w="7px" h="7px" borderRadius="full" bg={connected ? "green.500" : "yellow.500"} /><Text fontSize="xs" fontWeight="700" color={connected ? "green.700" : "yellow.700"}>{connected ? "Live" : "Reconnecting"}</Text></HStack>}
          <Menu><MenuButton as={Button} variant="ghost" size="sm" px={2}><HStack><Box w="34px" h="34px" borderRadius="full" bg="blue.50" color="blue.700" display="grid" placeItems="center" fontWeight="800">{user?.name?.[0] || "U"}</Box><Box display={{ base: "none", md: "block" }} textAlign="left"><Text fontSize="sm" fontWeight="700" lineHeight="1.1">{user?.name}</Text><Text fontSize="10px" color="gray.500" textTransform="capitalize">{user?.role}</Text></Box></HStack></MenuButton><MenuList><MenuItem onClick={onLogout} color="red.600">Sign out</MenuItem></MenuList></Menu>
        </HStack></HStack>
    </Box>
    <Box display="flex" alignItems="stretch">
      <Box as="nav" w="236px" bg="white" borderRight="1px solid" borderColor="gray.200" minH="calc(100vh - 68px)" p={4} position="sticky" top="68px" alignSelf="flex-start" display={{ base: "none", lg: "block" }}><Text px={3} mb={2} fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing=".1em">Workspace</Text><VStack align="stretch" spacing={1}>{nav.map((item) => { const path = item.path(id); const active = location.pathname === path; return <Button key={item.key} as={RouterLink} to={path} justifyContent="flex-start" variant="ghost" bg={active ? "blue.50" : "transparent"} color={active ? "blue.700" : "gray.600"} fontWeight={active ? "750" : "600"} leftIcon={<Box w="24px" h="24px" borderRadius="md" bg={active ? "blue.100" : "gray.100"} display="grid" placeItems="center" fontSize="10px" fontWeight="800">{item.glyph}</Box>}>{item.label}</Button>; })}</VStack><Box mt={8} p={3} borderRadius="lg" bg="gray.50"><Text fontSize="xs" fontWeight="700" color="gray.700">Clinical decision support</Text><Text fontSize="11px" color="gray.500" mt={1} lineHeight="1.5">Recommendations require named clinician approval before the queue changes.</Text></Box></Box>
      <Box flex={1} minW={0}><HStack as="nav" display={{ base: "flex", lg: "none" }} px={4} py={2} bg="white" borderBottom="1px solid" borderColor="gray.200" overflowX="auto">{nav.map((item) => { const path = item.path(id); const active = location.pathname === path; return <Button key={item.key} as={RouterLink} to={path} size="sm" flexShrink={0} variant={active ? "solid" : "ghost"} colorScheme={active ? "blue" : undefined}>{item.label}</Button>; })}</HStack><Box as="main" px={{ base: 4, md: 6, xl: 8 }} py={6} maxW="1500px" mx="auto">{children}</Box></Box>
    </Box>
  </Box>;
}
