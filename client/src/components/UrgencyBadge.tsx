import { Box } from "@chakra-ui/react";
import type { UrgencyTier } from "../types";

const styles: Record<UrgencyTier, { bg: string; color: string; border: string }> = {
  critical: { bg: "#FFF1F2", color: "#B4232F", border: "#FECDD3" },
  high:     { bg: "#FFF7ED", color: "#B45309", border: "#FED7AA" },
  medium:   { bg: "#FFFBEB", color: "#975A16", border: "#FDE68A" },
  low:      { bg: "#ECFDF5", color: "#176B58", border: "#A7F3D0" },
};

const urgencyAccent: Record<UrgencyTier, string> = {
  critical: "#C93636",
  high:     "#D97706",
  medium:   "#D69E2E",
  low:      "#23856D",
};

export function UrgencyBadge({ tier }: { tier: UrgencyTier }) {
  const s = styles[tier];
  return (
    <Box
      as="span"
      display="inline-block"
      bg={s.bg}
      color={s.color}
      border="1px solid"
      borderColor={s.border}
      fontWeight="800"
      fontSize="10px"
      letterSpacing="0.04em"
      textTransform="uppercase"
      px={2.5}
      py={1}
      lineHeight="1.4"
      borderRadius="full"
      userSelect="none"
    >
      {tier}
    </Box>
  );
}

export function urgencyStripeColor(tier: UrgencyTier): string {
  return urgencyAccent[tier];
}
