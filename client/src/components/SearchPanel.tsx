import {
  Modal, ModalOverlay, ModalContent, ModalBody, Box, HStack, VStack,
  Text, Input, InputGroup, InputLeftElement, Spinner, Badge, Button,
} from "@chakra-ui/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { UrgencyBadge } from "./UrgencyBadge";

interface SearchResult {
  call_id: string; patient_name: string; patient_phone: string | null;
  chief_complaint: string; recommended_dept: string | null;
  urgency_tier: string | null; text_excerpt: string;
  similarity_score: number | null; date: string;
}
interface Props { isOpen: boolean; onClose: () => void; clinicId: string | undefined; token: string | null; }

export function SearchPanel({ isOpen, onClose, clinicId, token }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [mode, setMode] = useState<"private-keyword" | "local-semantic">("private-keyword");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    setQuery(""); setResults([]); setSearched(false); setError(null);
  }, [isOpen]);

  const doSearch = useCallback(async (value: string) => {
    const clean = value.trim();
    if (clean.length < 2 || !clinicId || !token) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v1/clinics/${clinicId}/search?q=${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Search is temporarily unavailable");
      setResults(data.results ?? []); setMode(data.mode ?? "private-keyword"); setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search is temporarily unavailable"); setResults([]); setSearched(true);
    } finally { setLoading(false); }
  }, [clinicId, token]);

  const updateQuery = (value: string) => {
    setQuery(value); clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) debounceRef.current = setTimeout(() => doSearch(value), 450);
    else { setResults([]); setSearched(false); setError(null); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" motionPreset="slideInTop">
      <ModalOverlay />
      <ModalContent mt={{ base: 4, md: 20 }} maxH="78vh">
        <ModalBody p={0}>
          <Box px={{ base: 4, md: 6 }} pt={5} pb={4} borderBottom="1px solid" borderColor="gray.200">
            <HStack justify="space-between" mb={4}>
              <Box><Text fontSize="lg" fontWeight="800" color="gray.900">Search patient records</Text><Text fontSize="xs" color="gray.500" mt={0.5}>Search is restricted to this clinic’s consented intake records.</Text></Box>
              <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close search">✕</Button>
            </HStack>
            <InputGroup size="lg">
              <InputLeftElement pointerEvents="none" color="gray.400">⌕</InputLeftElement>
              <Input ref={inputRef} aria-label="Search patient records" placeholder="Try a patient name, chest pain, fever…" value={query} onChange={(event) => updateQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter") { clearTimeout(debounceRef.current); doSearch(query); } }} pl={10} />
              {loading && <Spinner position="absolute" right={4} top="14px" size="sm" color="blue.500" zIndex={2} />}
            </InputGroup>
          </Box>

          <Box overflowY="auto" maxH="calc(78vh - 150px)" bg="gray.50" p={{ base: 4, md: 5 }}>
            {error && <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="lg" p={4}><Text fontWeight="700" color="red.700">We couldn’t complete that search</Text><Text fontSize="sm" color="red.600" mt={1}>{error}. Please try again.</Text></Box>}

            {!loading && !error && !searched && (
              <Box textAlign="center" py={8}>
                <Box w="52px" h="52px" borderRadius="full" bg="blue.50" color="blue.600" display="grid" placeItems="center" mx="auto" fontSize="2xl">⌕</Box>
                <Text fontWeight="750" color="gray.800" mt={3}>Find past intake records quickly</Text>
                <Text fontSize="sm" color="gray.500" mt={1}>Search names, symptoms, complaints and transcript text.</Text>
                <HStack spacing={2} justify="center" mt={5} flexWrap="wrap">
                  {["chest pain", "child with fever", "difficulty breathing", "diabetes"].map((suggestion) => <Button key={suggestion} size="sm" variant="outline" onClick={() => updateQuery(suggestion)}>{suggestion}</Button>)}
                </HStack>
              </Box>
            )}

            {!loading && searched && !error && results.length === 0 && (
              <Box textAlign="center" py={10}><Text fontWeight="750" color="gray.800">No matching records</Text><Text fontSize="sm" color="gray.500" mt={1}>Try a broader symptom or check the patient spelling.</Text></Box>
            )}

            {results.length > 0 && (
              <VStack spacing={3} align="stretch">
                <HStack justify="space-between"><Text fontSize="sm" color="gray.500"><Text as="span" fontWeight="800" color="gray.800">{results.length}</Text> matching records</Text><Badge bg="green.50" color="green.700">{mode === "local-semantic" ? "Local semantic" : "Private keyword"}</Badge></HStack>
                {results.map((result) => (
                  <Box key={result.call_id} bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={4} boxShadow="xs">
                    <HStack justify="space-between" align="flex-start">
                      <Box><HStack spacing={2}><Text fontWeight="800" color="gray.900">{result.patient_name}</Text>{result.urgency_tier && <UrgencyBadge tier={result.urgency_tier as any} />}</HStack><Text fontSize="sm" color="gray.700" fontWeight="600" mt={2}>{result.chief_complaint}</Text></Box>
                      {result.similarity_score != null && <Badge bg="blue.50" color="blue.700">{Math.round(result.similarity_score * 100)}% match</Badge>}
                    </HStack>
                    <Text fontSize="sm" color="gray.500" lineHeight="1.55" mt={2} noOfLines={3}>{result.text_excerpt}</Text>
                    <HStack mt={3} color="gray.400" fontSize="xs" spacing={3}>{result.recommended_dept && <Text>{result.recommended_dept}</Text>}<Text>{new Date(result.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</Text></HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </Box>

          <HStack px={5} py={3} borderTop="1px solid" borderColor="gray.200" justify="space-between" bg="white"><Text fontSize="xs" color="gray.400">Enter to search • Esc to close</Text><HStack spacing={1}><Box w="7px" h="7px" borderRadius="full" bg="green.500" /><Text fontSize="xs" color="gray.500">Clinic data stays private</Text></HStack></HStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
