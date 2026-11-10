import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = { initialColorMode: "light", useSystemColorMode: false };

const theme = extendTheme({
  config,
  fonts: {
    heading: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  },
  radii: { sm: "6px", base: "8px", md: "10px", lg: "14px", xl: "18px", "2xl": "24px", full: "9999px" },
  colors: {
    gray: { 50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A" },
    neo: { bg: "#F4F7FA", white: "#FFFFFF", black: "#14213D", yellow: "#F2C94C", blue: "#1261A0", red: "#C93636", orange: "#D97706", amber: "#B7791F", green: "#23856D", purple: "#6D5BD0", teal: "#0F766E" },
    blue: { 50: "#EFF6FF", 100: "#DBEAFE", 400: "#3B82F6", 500: "#1261A0", 600: "#0B4F87", 700: "#083B66" },
    red: { 50: "#FFF1F2", 100: "#FFE4E6", 400: "#F05252", 500: "#C93636", 600: "#B4232F", 700: "#8E1B26" },
    orange: { 50: "#FFF7ED", 100: "#FFEDD5", 400: "#FB923C", 500: "#D97706", 600: "#B45309", 700: "#92400E" },
    yellow: { 50: "#FFFBEB", 100: "#FEF3C7", 400: "#FBBF24", 500: "#D69E2E", 600: "#B7791F", 700: "#975A16" },
    green: { 50: "#ECFDF5", 100: "#D1FAE5", 400: "#34D399", 500: "#23856D", 600: "#176B58", 700: "#115445" },
    purple: { 50: "#F5F3FF", 100: "#EDE9FE", 400: "#8B5CF6", 500: "#6D5BD0", 600: "#5945BA", 700: "#46349A" },
    teal: { 50: "#F0FDFA", 100: "#CCFBF1", 400: "#2DD4BF", 500: "#0F766E", 600: "#0D625C", 700: "#0F4F4A" },
  },
  shadows: {
    xs: "0 1px 2px rgba(15,23,42,.05)", sm: "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
    md: "0 8px 24px rgba(15,23,42,.09)", lg: "0 16px 40px rgba(15,23,42,.12)",
  },
  styles: {
    global: {
      "html, body": { bg: "#F4F7FA", color: "#1E293B", WebkitFontSmoothing: "antialiased" },
      "*": { boxSizing: "border-box" },
      "*:focus-visible": { outline: "3px solid rgba(18,97,160,.35)", outlineOffset: "2px" },
      "::-webkit-scrollbar": { w: "8px", h: "8px" },
      "::-webkit-scrollbar-track": { bg: "transparent" },
      "::-webkit-scrollbar-thumb": { bg: "#CBD5E1", borderRadius: "9999px" },
    },
  },
  components: {
    Button: {
      baseStyle: { fontWeight: "700", borderRadius: "8px", letterSpacing: "-0.01em" },
      variants: {
        solid: { boxShadow: "xs", _hover: { transform: "translateY(-1px)", boxShadow: "sm" }, _active: { transform: "none" } },
        outline: { border: "1px solid", borderColor: "gray.300", bg: "white", _hover: { bg: "gray.50", borderColor: "gray.400" } },
        ghost: { _hover: { bg: "gray.100" } },
      },
    },
    Input: {
      variants: { outline: { field: { border: "1px solid", borderColor: "gray.300", borderRadius: "8px", bg: "white", _placeholder: { color: "gray.400" }, _hover: { borderColor: "gray.400" }, _focusVisible: { borderColor: "neo.blue", boxShadow: "0 0 0 3px rgba(18,97,160,.14)" } } } },
    },
    Badge: { baseStyle: { borderRadius: "full", px: 2.5, py: 1, fontSize: "10px", fontWeight: "700", letterSpacing: "0.04em" } },
    Modal: { baseStyle: { dialog: { borderRadius: "16px", boxShadow: "lg", bg: "white", mx: 4, overflow: "hidden" }, header: { borderBottom: "1px solid", borderColor: "gray.200", fontWeight: "700" }, footer: { borderTop: "1px solid", borderColor: "gray.200" }, overlay: { bg: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)" } } },
  },
});

export default theme;
