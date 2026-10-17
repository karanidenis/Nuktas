import {
  Modal, ModalOverlay, ModalContent, ModalBody,
  Box, HStack, VStack, Text, Input, Spinner,
} from "@chakra-ui/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { UrgencyBadge } from "./UrgencyBadge";

interface SearchResult {
  call_id: string;
  patient_name: string;
  patient_phone: string | null;
  chief_complaint: string;
  recommended_dept: string | null;
  urgency_tier: string | null;
  text_excerpt: string;
  similarity_score: number;
  date: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string | undefined;
  token: string | null;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <HStack spacing={1} align="center">
      {[0.7, 0.5, 0.3].map((threshold, i) => (
        <Box
          key={i}
          w="10px"
          h="3px"
          bg={score >= threshold ? "#0047FF" : "gray.200"}
        />
      ))}
      <Text fontSize="8px" color="gray.400" fontFamily="mono">
        {Math.round(score * 100)}%
      </Text>
    </HStack>
  );
}

export function SearchPanel({ isOpen, onClose, clinicId, token }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSearched(false);
      setError(null);
    }
  }, [isOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2 || !clinicId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/clinics/${clinicId}/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, token]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(val), 500);
    } else {
      setResults([]);
      setSearched(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && query.length >= 2) {
      clearTimeout(debounceRef.current);
      doSearch(query);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" motionPreset="slideInTop">
      <ModalOverlay bg="rgba(10,10,10,0.7)" backdropFilter="blur(2px)" />
      <ModalContent
        mt="80px"
        borderRadius="0"
        border="2px solid"
        borderColor="neo.black"
        boxShadow="8px 8px 0 #0A0A0A"
        bg="#F5F0E8"
        overflow="hidden"
        maxH="70vh"
      >
        <ModalBody p={0}>
          {/* Search input */}
          <Box
            borderBottom="2px solid"
            borderColor="neo.black"
            bg="white"
            px={4}
            py={3}
          >
            <HStack spacing={3}>
              <Box
                bg="#0A0A0A"
                px={2}
                py="3px"
                fontSize="9px"
                fontWeight="800"
                color="#FFE600"
                letterSpacing="0.1em"
                textTransform="uppercase"
                flexShrink={0}
              >
                AI SEARCH
              </Box>
              <Input
                ref={inputRef}
                variant="unstyled"
                placeholder="Search voice transcripts semantically…"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                fontSize="sm"
                fontWeight="600"
                flex={1}
              />
              {loading && <Spinner size="xs" color="neo.blue" />}
              <Box
                border="1.5px solid"
                borderColor="gray.300"
                px={2}
                py="2px"
                fontSize="9px"
                fontWeight="700"
                color="gray.400"
                letterSpacing="0.08em"
                cursor="pointer"
                onClick={onClose}
                _hover={{ borderColor: "#E50000", color: "#E50000" }}
              >
                ESC
              </Box>
            </HStack>
          </Box>

          {/* Results area */}
          <Box overflowY="auto" maxH="calc(70vh - 60px)">
            {error && (
              <Box p={4}>
                <Text fontSize="sm" color="#E50000" fontWeight="600">Search error: {error}</Text>
              </Box>
            )}

            {!loading && !error && !searched && (
              <Box p={6} textAlign="center">
                <Text fontSize="2xl" mb={2}>🔍</Text>
                <Text fontWeight="700" mb={1} fontSize="sm">Semantic Voice Transcript Search</Text>
                <Text fontSize="xs" color="gray.500" maxW="320px" mx="auto" lineHeight="1.6">
                  Search past intake calls by meaning, not just keywords.
                  Try "chest pain elderly" or "child with fever".
                </Text>
                <HStack spacing={2} justify="center" mt={4} flexWrap="wrap">
                  {["chest pain", "child with fever", "difficulty breathing", "diabetes management"].map((s) => (
                    <Box
                      key={s}
                      as="button"
                      onClick={() => { setQuery(s); handleQueryChange(s); }}
                      border="1.5px solid"
                      borderColor="gray.300"
                      px={3}
                      py="4px"
                      fontSize="10px"
                      fontWeight="700"
                      bg="white"
                      cursor="pointer"
                      _hover={{ borderColor: "#0047FF", color: "#0047FF" }}
                    >
                      {s}
                    </Box>
                  ))}
                </HStack>
              </Box>
            )}

            {!loading && searched && results.length === 0 && (
              <Box p={6} textAlign="center">
                <Text fontSize="2xl" mb={2}>📭</Text>
                <Text fontWeight="700" mb={1} fontSize="sm">No matching transcripts</Text>
                <Text fontSize="xs" color="gray.500">
                  Try different keywords or broader terms.
                </Text>
              </Box>
            )}

            {results.length > 0 && (
              <VStack spacing={0} align="stretch">
                <Box
                  px={4}
                  py={2}
                  borderBottom="1px solid"
                  borderColor="gray.200"
                  bg="white"
                >
                  <Text fontSize="9px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="0.1em">
                    {results.length} result{results.length !== 1 ? "s" : ""} · sorted by relevance
                  </Text>
                </Box>
                {results.map((r, i) => (
                  <Box
                    key={`${r.call_id}-${i}`}
                    px={4}
                    py={3}
                    borderBottom="1px solid"
                    borderColor="gray.100"
                    bg="white"
                    _hover={{ bg: "#F5F0E8" }}
                    cursor="default"
                  >
                    <HStack justify="space-between" mb={1}>
                      <HStack spacing={2}>
                        <Text fontSize="12px" fontWeight="800">{r.patient_name}</Text>
                        {r.urgency_tier && <UrgencyBadge tier={r.urgency_tier as any} />}
                      </HStack>
                      <ScoreBar score={r.similarity_score} />
                    </HStack>

                    <Text fontSize="11px" fontWeight="600" color="gray.700" mb={1}>
                      {r.chief_complaint}
                    </Text>

                    <HStack spacing={3} mb={1}>
                      {r.recommended_dept && (
                        <Text fontSize="10px" color="gray.500">
                          → {r.recommended_dept}
                        </Text>
                      )}
                      {r.patient_phone && (
                        <Text fontSize="10px" color="gray.400" fontFamily="mono">
                          {r.patient_phone}
                        </Text>
                      )}
                    </HStack>

                    <Text
                      fontSize="10px"
                      color="gray.400"
                      lineHeight="1.5"
                      noOfLines={2}
                      fontFamily="mono"
                    >
                      {r.text_excerpt}
                    </Text>

                    <Text fontSize="9px" color="gray.300" mt={1}>
                      {new Date(r.date).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </Text>
                  </Box>
                ))}
              </VStack>
            )}
          </Box>

          {/* Footer */}
          <Box
            borderTop="2px solid"
            borderColor="neo.black"
            px={4}
            py={2}
            bg="white"
          >
            <HStack spacing={4}>
              <HStack spacing={1}>
                <Box border="1px solid" borderColor="gray.300" px={1} fontSize="9px" fontWeight="700" color="gray.400">↵</Box>
                <Text fontSize="9px" color="gray.400">search</Text>
              </HStack>
              <HStack spacing={1}>
                <Box border="1px solid" borderColor="gray.300" px={1} fontSize="9px" fontWeight="700" color="gray.400">ESC</Box>
                <Text fontSize="9px" color="gray.400">close</Text>
              </HStack>
              <Text fontSize="9px" color="gray.300" ml="auto">
                Powered by OpenAI text-embedding-3-small
              </Text>
            </HStack>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
