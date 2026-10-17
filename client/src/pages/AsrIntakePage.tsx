import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { Navigate, useParams } from "react-router-dom";
import type { User } from "../types";

interface Props {
  token: string | null;
  user: User | null;
}

export function AsrIntakePage({ token, user }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  const toast = useToast();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("+254700000001");
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const canRecord = useMemo(() => typeof window !== "undefined" && !!navigator.mediaDevices, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (!token) return <Navigate to="/login" replace />;

  const handleStart = async () => {
    if (!canRecord) {
      toast({ title: "Recording not supported", status: "error" });
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setIsRecording(true);
  };

  const handleStop = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleSubmit = async () => {
    if (!audioUrl || !clinic_id) return;
    setBusy(true);
    setResult(null);

    const audioBlob = await fetch(audioUrl).then((r) => r.blob());
    const response = await fetch(`/api/v1/asr/intake?clinic_id=${clinic_id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-patient-phone": phone,
      },
      body: audioBlob,
    });

    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast({ title: "ASR intake failed", description: data.error ?? "Unknown error", status: "error" });
      return;
    }

    setResult(data);
    toast({ title: "Queue entry created", status: "success" });
  };

  return (
    <Box minH="100vh" bg="#F5F0E8" px={{ base: 4, md: 10 }} py={8}>
      <Box maxW="720px" mx="auto" bg="white" border="2px solid" borderColor="neo.black" p={{ base: 5, md: 8 }}>
        <VStack align="stretch" spacing={5}>
          <Box>
            <Text fontSize="xs" fontWeight="800" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
              ASR Intake
            </Text>
            <Text fontSize="2xl" fontWeight="800">
              Record a patient intake
            </Text>
            <Text fontSize="sm" color="gray.600" mt={2}>
              Record audio, transcribe it, and create a queue entry without Twilio.
            </Text>
          </Box>

          <VStack align="stretch" spacing={3}>
            <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.1em" color="gray.500">
              Patient phone
            </Text>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </VStack>

          <HStack spacing={3}>
            <Button
              onClick={handleStart}
              isDisabled={isRecording || busy}
              variant="outline"
              borderColor="#0A0A0A"
            >
              Start recording
            </Button>
            <Button
              onClick={handleStop}
              isDisabled={!isRecording}
              bg="#0A0A0A"
              color="white"
              _hover={{ bg: "black" }}
            >
              Stop
            </Button>
          </HStack>

          {audioUrl && (
            <Box>
              <audio controls src={audioUrl} style={{ width: "100%" }} />
            </Box>
          )}

          <Button
            onClick={handleSubmit}
            isDisabled={!audioUrl || busy}
            bg="#FFE600"
            border="2px solid"
            borderColor="#0A0A0A"
            _hover={{ bg: "#FFEF5A" }}
          >
            {busy ? "Submitting…" : "Transcribe and create entry"}
          </Button>

          {result && (
            <Box bg="#0A0A0A" color="white" p={4} fontSize="sm" whiteSpace="pre-wrap">
              <Text fontWeight="700" mb={2}>Transcript</Text>
              <Text>{result.transcript}</Text>
              <Text fontWeight="700" mt={4} mb={2}>Queue entry</Text>
              <Text>#{result.queue_entry?.queue_number} — {result.queue_entry?.status}</Text>
              <Text fontWeight="700" mt={4} mb={2}>Triage</Text>
              <HStack spacing={2} wrap="wrap">
                <Badge colorScheme="purple">Language: {result.language ?? "unknown"}</Badge>
                <Badge colorScheme="blue">Department: {result.queue_entry?.department?.name ?? "unknown"}</Badge>
                <Badge colorScheme="orange">Urgency: {result.intake?.urgency_tier ?? "unknown"}</Badge>
              </HStack>
            </Box>
          )}
        </VStack>
      </Box>
    </Box>
  );
}
