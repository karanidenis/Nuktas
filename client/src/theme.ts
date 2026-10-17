import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "light",
  useSystemColorMode: false,
};

// Neo-brutalist radii — near zero, max 2px
const radii = {
  none: "0",
  sm: "0",
  base: "0",
  md: "2px",
  lg: "2px",
  xl: "2px",
  "2xl": "2px",
  "3xl": "2px",
  full: "9999px",
};

// Warm grays for neo-brutalist backgrounds
const gray = {
  50:  "#F9F7F2",
  100: "#F5F0E8",
  200: "#E8E2D8",
  300: "#D4CFC3",
  400: "#B0AA9E",
  500: "#7A7570",
  600: "#5A5650",
  700: "#3D3A36",
  800: "#2A2825",
  900: "#1A1917",
};

const theme = extendTheme({
  config,
  radii,
  fonts: {
    heading: "'Space Grotesk', sans-serif",
    body:    "'Space Grotesk', sans-serif",
    mono:    "'Space Mono', monospace",
  },
  colors: {
    gray,
    neo: {
      bg:     "#F5F0E8",
      white:  "#FFFFFF",
      black:  "#0A0A0A",
      yellow: "#FFE600",
      blue:   "#0047FF",
      red:    "#E50000",
      orange: "#FF6300",
      amber:  "#F59B00",
      green:  "#009944",
      purple: "#7C3AED",
      teal:   "#008B8B",
    },
    // Chakra colorScheme aliases used by Badge/Button etc.
    blue:   { 50: "#E5EDFF", 100: "#C0D4FF", 400: "#4D7AFF", 500: "#0047FF", 600: "#003ACC", 700: "#002E99" },
    red:    { 50: "#FFE5E5", 100: "#FFB3B3", 400: "#FF3333", 500: "#E50000", 600: "#CC0000", 700: "#990000" },
    orange: { 50: "#FFF0E5", 100: "#FFCFA0", 400: "#FF8533", 500: "#FF6300", 600: "#D45200", 700: "#A33F00" },
    yellow: { 50: "#FFFDE5", 100: "#FFF7B3", 400: "#FFE933", 500: "#FFE600", 600: "#CDB800", 700: "#998A00" },
    green:  { 50: "#E5F5EC", 100: "#B3DFC3", 400: "#33BB70", 500: "#009944", 600: "#007833", 700: "#005C27" },
    purple: { 50: "#F3EEFF", 100: "#D9C7FF", 400: "#9966FF", 500: "#7C3AED", 600: "#6225CF", 700: "#4A1BAF" },
    teal:   { 50: "#E5F6F6", 100: "#B3E5E5", 400: "#33AAAA", 500: "#008B8B", 600: "#006E6E", 700: "#005252" },
  },
  styles: {
    global: {
      "html, body": {
        bg: "#F5F0E8",
        color: "#0A0A0A",
        fontFamily: "'Space Grotesk', sans-serif",
        WebkitFontSmoothing: "antialiased",
      },
      "*": {
        boxSizing: "border-box",
      },
      // Remove default scrollbar ugliness
      "::-webkit-scrollbar": { w: "6px", h: "6px" },
      "::-webkit-scrollbar-track": { bg: "#F5F0E8" },
      "::-webkit-scrollbar-thumb": { bg: "#B0AA9E", borderRadius: "0" },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        fontSize: "xs",
        borderRadius: "2px",
        transition: "box-shadow 0.08s ease, transform 0.08s ease",
        _focus: { outline: "2px solid #0047FF", outlineOffset: "2px" },
      },
      variants: {
        solid: {
          border: "2px solid",
          borderColor: "neo.black",
          boxShadow: "3px 3px 0 #0A0A0A",
          _hover: {
            boxShadow: "5px 5px 0 #0A0A0A",
            transform: "translate(-2px,-2px)",
          },
          _active: {
            boxShadow: "1px 1px 0 #0A0A0A",
            transform: "translate(2px,2px)",
          },
        },
        outline: {
          border: "2px solid",
          borderColor: "neo.black",
          bg: "white",
          _hover: {
            bg: "gray.100",
            boxShadow: "3px 3px 0 #0A0A0A",
            transform: "translate(-1px,-1px)",
          },
          _active: {
            boxShadow: "1px 1px 0 #0A0A0A",
            transform: "translate(1px,1px)",
          },
        },
        ghost: {
          _hover: { bg: "gray.200" },
          _active: { bg: "gray.300" },
        },
      },
      defaultProps: { variant: "solid" },
    },
    Input: {
      variants: {
        outline: {
          field: {
            border: "2px solid",
            borderColor: "neo.black",
            borderRadius: "2px",
            bg: "white",
            fontWeight: "500",
            _placeholder: { color: "gray.400" },
            _hover: { borderColor: "neo.blue" },
            _focus: {
              borderColor: "neo.blue",
              boxShadow: "3px 3px 0 #0047FF",
              outline: "none",
            },
          },
        },
      },
      defaultProps: { variant: "outline" },
    },
    Select: {
      variants: {
        outline: {
          field: {
            border: "2px solid",
            borderColor: "neo.black",
            borderRadius: "2px",
            bg: "white",
            fontWeight: "600",
            fontSize: "xs",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            _hover: { borderColor: "neo.blue" },
            _focus: { boxShadow: "none", borderColor: "neo.blue" },
          },
          icon: { color: "neo.black" },
        },
      },
      defaultProps: { variant: "outline" },
    },
    Badge: {
      baseStyle: {
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        borderRadius: "2px",
        px: 2,
        py: "2px",
        fontSize: "2xs",
      },
      variants: {
        solid: {},
        outline: {
          border: "1.5px solid",
          bg: "transparent",
        },
        subtle: {},
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          borderRadius: "2px",
          border: "2px solid",
          borderColor: "neo.black",
          boxShadow: "8px 8px 0 #0A0A0A",
          bg: "white",
          mx: 4,
        },
        header: {
          borderBottom: "2px solid",
          borderColor: "neo.black",
          fontWeight: "700",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontSize: "sm",
          py: 4,
          px: 6,
        },
        footer: {
          borderTop: "2px solid",
          borderColor: "neo.black",
          py: 4,
          px: 6,
        },
        closeButton: {
          borderRadius: "2px",
          _hover: { bg: "gray.200" },
          top: "14px",
          right: "16px",
        },
        overlay: {
          bg: "blackAlpha.600",
          backdropFilter: "blur(2px)",
        },
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "xs",
            borderBottom: "3px solid transparent",
            _selected: {
              color: "neo.black",
              borderBottomColor: "neo.black",
            },
            _hover: { color: "neo.black", bg: "transparent" },
          },
          tablist: {
            borderBottom: "2px solid",
            borderColor: "neo.black",
          },
        },
      },
    },
    Tooltip: {
      baseStyle: {
        bg: "neo.black",
        color: "white",
        fontWeight: "600",
        fontSize: "xs",
        letterSpacing: "0.04em",
        px: 3,
        py: 1,
        borderRadius: "2px",
        border: "1.5px solid",
        borderColor: "neo.black",
      },
    },
    Divider: {
      baseStyle: {
        borderColor: "neo.black",
        opacity: 0.2,
      },
    },
  },
});

export default theme;
