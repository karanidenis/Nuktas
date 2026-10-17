import { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Button,
  HStack,
  Input,
  Text,
  VStack,
  useToast,
  Spinner,
  Circle,
  Badge,
} from "@chakra-ui/react";
import { Navigate, useParams } from "react-router-dom";
import type { User } from "../types";

interface Props {
  token: string | null;
  user: User | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AsrConversationPage({ token, user }: Props) {
  const { clinic_id } = useParams<{ clinic_id: string }>();
  const toast = useToast();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phone, setPhone] = useState("+254700000001");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const callTimerRef = useRef<any>(null);

  const canRecord = typeof window !== "undefined" && !!navigator.mediaDevices;

  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  if (!token) return <Navigate to="/login" replace />;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const playAudio = (audioBase64: string, sampleRate: number) => {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  };

  const speak = (_text: string, tts?: { audio_base64?: string; sample_rate?: number }) => {
    if (tts?.audio_base64 && tts?.sample_rate) {
      playAudio(tts.audio_base64, tts.sample_rate);
    }
  };

  const startSession = async () => {
    if (!clinic_id || !phone) return;
    setBusy(true);
    const response = await fetch(`/api/v1/asr/conversation/start?clinic_id=${clinic_id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-patient-phone": phone,
      },
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      toast({ title: "Connection failed", description: data.error, status: "error" });
      return;
    }
    setSessionId(data.session_id);
    setMessages([{ role: "assistant", content: data.reply }]);
    setAutoMode(true);
    speak(data.reply, data.tts);
    setCallDuration(0);
    callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    setTimeout(() => {
      if (!data.intake_complete) handleStartRecording();
    }, 2000);
  };

  const detectSilence = useCallback((analyser: AnalyserNode, onSilence: () => void) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let silenceDuration = 0;
    const checkInterval = 100;
    const silenceThreshold = 1500;
    const maxSilence = 2000;

    const check = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

      if (volume < 30) {
        silenceDuration += checkInterval;
        if (silenceDuration >= maxSilence && chunksRef.current.length > 0) {
          onSilence();
          return;
        }
      } else {
        silenceDuration = 0;
      }
      if (isRecording) {
        silenceTimerRef.current = setTimeout(check, checkInterval);
      }
    };
    check();
  }, [isRecording]);

  const handleStartRecording = async () => {
    if (!canRecord || !sessionId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        await sendTurn();
      };
      recorder.start();
      setIsRecording(true);
      setListening(true);
      detectSilence(analyser, () => {
        recorderRef.current?.stop();
      });
    } catch (err) {
      toast({ title: "Mic error", description: String(err), status: "error" });
    }
  };

  const handleStopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const sendTurn = async () => {
    if (!sessionId) return;
    setBusy(true);
    const audioBlob = new Blob(chunksRef.current, { type: "audio/wav" });
    const response = await fetch(`/api/v1/asr/conversation/turn?session_id=${sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-session-id": sessionId,
      },
      body: audioBlob,
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setListening(false);
    if (!response.ok) {
      toast({ title: "Turn failed", description: data.error, status: "error" });
      if (autoMode) {
        setTimeout(() => handleStartRecording(), 1000);
      }
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "user", content: data.transcript },
      { role: "assistant", content: data.reply },
    ]);
    if (data.reply) {
      speak(data.reply, data.tts);
      if (autoMode && !data.intake_complete) {
        setTimeout(() => {
          handleStartRecording();
        }, 1500);
      }
    }
    if (data.intake_complete) {
      toast({ title: "Intake complete", status: "success" });
    }
  };

  const handleEndConversation = async () => {
    if (!sessionId || !clinic_id) return;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setBusy(true);
    const response = await fetch(`/api/v1/asr/conversation/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId, clinic_id, phone }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      toast({ title: "Call ended", description: data.error, status: "warning" });
      setSessionId(null);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: data.reply || `Queue #${data.queue_entry?.queue_number}` },
    ]);
    speak(data.reply || `Queue number ${data.queue_entry?.queue_number}`, data.tts);
    setSessionId(null);
  };

  return (
    <Box minH="100vh" bg="#0A0A0A" display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={4}>
      {/* Phone frame */}
      <Box
        w="100%"
        maxW="380px"
        bg="#1a1a1a"
        borderRadius="40px"
        border="4px solid #333"
        overflow="hidden"
        boxShadow="0 20px 60px rgba(0,0,0,0.5)"
      >
        {/* Phone header */}
        <Box bg="#111" p={4} textAlign="center" borderBottom="1px solid #222">
          <Text color="#FFE600" fontSize="lg" fontWeight="800" letterSpacing="0.1em">
            NUKTAS
          </Text>
          {sessionId && (
            <HStack justify="center" mt={2} spacing={2}>
              <Circle size="8px" bg="#00C853" />
              <Text color="#666" fontSize="xs" fontFamily="mono">
                {formatDuration(callDuration)}
              </Text>
            </HStack>
          )}
        </Box>

        {/* Phone screen - conversation */}
        <Box h="400px" overflowY="auto" p={4} bg="#0d0d0d">
          {messages.length === 0 ? (
            <VStack justify="center" h="full" spacing={4}>
              <Text color="#888" fontSize="sm">Nuktas Voice Intake</Text>
              <Text color="#555" fontSize="xs" textAlign="center">
                Speak with the AI assistant to check in
              </Text>
            </VStack>
          ) : (
            <VStack align="stretch" spacing={3}>
              {messages.map((m, i) => (
                <Box
                  key={i}
                  alignSelf={m.role === "user" ? "flex-end" : "flex-start"}
                  maxW="85%"
                >
                  <Box
                    bg={m.role === "user" ? "#FFE600" : "#222"}
                    color={m.role === "user" ? "#000" : "#fff"}
                    px={4}
                    py={3}
                    borderRadius={m.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px"}
                    fontSize="sm"
                  >
                    {m.content.replace(/<INTAKE_COMPLETE>[\s\S]*$/m, "").trim()}
                  </Box>
                </Box>
              ))}
              {listening && (
                <Box alignSelf="center">
                  <HStack spacing={2}>
                    <Box w="8px" h="8px" bg="#FFE600" borderRadius="full" animation="pulse 1s infinite" />
                    <Box w="8px" h="8px" bg="#FFE600" borderRadius="full" animation="pulse 1s infinite" style={{animationDelay:"0.2s"}} />
                    <Box w="8px" h="8px" bg="#FFE600" borderRadius="full" animation="pulse 1s infinite" style={{animationDelay:"0.4s"}} />
                  </HStack>
                </Box>
              )}
            </VStack>
          )}
        </Box>

        {/* Phone keypad area */}
        <Box bg="#111" p={4} borderTop="1px solid #222">
          {!sessionId ? (
            <VStack spacing={3}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Patient phone"
                bg="#1a1a1a"
                color="#fff"
                border="1px solid #333"
                fontSize="sm"
              />
              <Button
                onClick={startSession}
                isDisabled={busy || !phone}
                w="full"
                bg="#FFE600"
                color="#000"
                fontWeight="800"
                borderRadius="30px"
                size="lg"
                _hover={{ bg: "#FFEF5A" }}
              >
                {busy ? <Spinner size="sm" /> : "Call"}
              </Button>
            </VStack>
          ) : (
            <VStack spacing={3}>
              {autoMode && (
                <Text color="#00C853" fontSize="xs" fontWeight="bold">
                  {listening ? "🎤 Listening..." : "AI is speaking..."}
                </Text>
              )}
              <HStack spacing={4} justify="center">
                {!autoMode ? (
                  <Button
                    onClick={handleStartRecording}
                    isDisabled={isRecording || busy}
                    w="80px"
                    h="80px"
                    borderRadius="full"
                    bg={isRecording ? "#E50000" : "#FFE600"}
                    _hover={{ bg: isRecording ? "#CC0000" : "#FFEF5A" }}
                    boxShadow={isRecording ? "0 0 20px #E50000" : "0 0 20px #FFE600"}
                  >
                    {isRecording ? (
                      <Box w="24px" h="24px" bg="#fff" borderRadius="4px" />
                    ) : (
                      <Box w="24px" h="24px" bg="#000" borderRadius="full" />
                    )}
                  </Button>
                ) : listening ? (
                  <Box w="80px" h="80px" borderRadius="full" bg="#E50000" display="flex" alignItems="center" justifyContent="center" boxShadow="0 0 20px #E50000">
                    <Box w="24px" h="24px" bg="#fff" borderRadius="4px" />
                  </Box>
                ) : (
                  <Box w="80px" h="80px" borderRadius="full" bg="#333" display="flex" alignItems="center" justifyContent="center">
                    <Spinner size="md" color="#FFE600" />
                  </Box>
                )}
                {isRecording && (
                  <Button
                    onClick={handleStopRecording}
                    w="50px"
                    h="50px"
                    borderRadius="full"
                    bg="#333"
                    color="#fff"
                    fontSize="xs"
                  >
                    End
                  </Button>
                )}
              </HStack>
              <HStack w="full">
                <Button
                  onClick={() => setAutoMode(!autoMode)}
                  size="xs"
                  variant={autoMode ? "solid" : "outline"}
                  bg={autoMode ? "#00C853" : "transparent"}
                  borderColor="#333"
                  color={autoMode ? "#000" : "#666"}
                >
                  {autoMode ? "Auto" : "Manual"}
                </Button>
                <Button
                  onClick={handleEndConversation}
                  isDisabled={busy}
                  variant="outline"
                  borderColor="#333"
                  color="#888"
                  fontSize="xs"
                  flex={1}
                >
                  End Call
                </Button>
              </HStack>
            </VStack>
          )}
        </Box>
      </Box>

      {/* CSS for animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  );
}