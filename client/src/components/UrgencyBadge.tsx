import { Box } from "@chakra-ui/react";
import type { UrgencyTier } from "../types";

const styles: Record<UrgencyTier, { bg: string; color: string; border: string }> = {
  critical: { bg: "#E50000", color: "#FFFFFF", border: "#B30000" },
  high:     { bg: "#FF6300", color: "#FFFFFF", border: "#CC4F00" },
  medium:   { bg: "#F59B00", color: "#0A0A0A", border: "#CC7E00" },
  low:      { bg: "#009944", color: "#FFFFFF", border: "#007733" },
};

const urgencyAccent: Record<UrgencyTier, string> = {
  critical: "#E50000",
  high:     "#FF6300",
  medium:   "#F59B00",
  low:      "#009944",
};

export function UrgencyBadge({ tier }: { tier: UrgencyTier }) {
  const s = styles[tier];
  return (
    <Box
      as="span"
      display="inline-block"
      bg={s.bg}
      color={s.color}
      border="1.5px solid"
      borderColor={s.border}
      fontWeight="800"
      fontSize="9px"
      letterSpacing="0.12em"
      textTransform="uppercase"
      px="6px"
      py="2px"
      lineHeight="1.4"
      borderRadius="2px"
      userSelect="none"
    >
      {tier}
    </Box>
  );
}

export function urgencyStripeColor(tier: UrgencyTier): string {
  return urgencyAccent[tier];
}
