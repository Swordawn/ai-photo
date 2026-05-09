---
name: Ethereal Lens
colors:
  surface: '#121315'
  surface-dim: '#121315'
  surface-bright: '#38393b'
  surface-container-lowest: '#0d0e10'
  surface-container-low: '#1a1c1d'
  surface-container: '#1e2021'
  surface-container-high: '#292a2c'
  surface-container-highest: '#343537'
  on-surface: '#e3e2e4'
  on-surface-variant: '#cac4d2'
  inverse-surface: '#e3e2e4'
  inverse-on-surface: '#2f3032'
  outline: '#938f9c'
  outline-variant: '#484551'
  surface-tint: '#ccbeff'
  primary: '#d3c5ff'
  on-primary: '#342073'
  primary-container: '#b8a5ff'
  on-primary-container: '#483688'
  inverse-primary: '#6351a4'
  secondary: '#cac4d0'
  on-secondary: '#322f38'
  secondary-container: '#49454f'
  on-secondary-container: '#b9b3bf'
  tertiary: '#d1cbd4'
  on-tertiary: '#322f36'
  tertiary-container: '#b5b0b9'
  on-tertiary-container: '#46434a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e7deff'
  primary-fixed-dim: '#ccbeff'
  on-primary-fixed: '#1f025e'
  on-primary-fixed-variant: '#4b398b'
  secondary-fixed: '#e7e0ec'
  secondary-fixed-dim: '#cac4d0'
  on-secondary-fixed: '#1d1a23'
  on-secondary-fixed-variant: '#49454f'
  tertiary-fixed: '#e7e0e9'
  tertiary-fixed-dim: '#cac4cd'
  on-tertiary-fixed: '#1d1a21'
  on-tertiary-fixed-variant: '#49454d'
  background: '#121315'
  on-background: '#e3e2e4'
  surface-variant: '#343537'
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 20px
  margin-desktop: 40px
  gutter: 16px
  touch-target-min: 44px
---

## Brand & Style

This design system is built for a premium AI photo experience that prioritizes artistic expression over technical utility. The brand personality is sophisticated, calm, and visionary, moving away from high-contrast "hacker" aesthetics toward a lush, cinematic environment.

The style is a hybrid of **Minimalism** and **Glassmorphism**. It utilizes deep, atmospheric layering to create a sense of infinite digital space. Visual interest is generated through soft, fluid gradients and the interplay of light on translucent surfaces rather than heavy borders or flat fills. The UI should feel like a high-end physical camera lens—precise, smooth, and expensive.

## Colors

The palette is anchored by **Deep Surface (#0F0D13)**, which provides a rich, non-pure black foundation that prevents eye strain. **Muted Slate (#2A2730)** acts as the secondary surface color for cards and containers, creating subtle separation from the background.

**Soft Purple Accent (#B8A5FF)** is the hero color, used sparingly for primary actions, progress indicators, and active states. It should feel like a soft glow rather than a harsh neon. For background interest, use ultra-wide, low-opacity radial gradients of Soft Purple (at 5-10% opacity) behind glass containers to simulate depth and "AI energy" without cluttering the interface.

## Typography

The typographic system pairs the technical precision of **Space Grotesk** for headlines with the exceptional readability of **Inter** for UI elements and body text. 

Headlines use tighter tracking and leading to create a high-fashion, editorial feel. Labels and small buttons should utilize Inter with a medium or semi-bold weight and slightly increased letter spacing to ensure maximum legibility against dark, blurred backgrounds. All text should be rendered with anti-aliasing for a smooth, premium finish.

## Layout & Spacing

This design system employs a **Fluid Grid** model with generous safe areas. For mobile, use a 4-column grid; for tablet/desktop, move to a 12-column grid. 

The spacing rhythm is based on an **8px linear scale**, but utilizes "Internal Air"—increased padding within cards and containers—to evoke a sense of luxury. Avoid cramped layouts; prioritize the photo content by giving it wide margins and minimizing the footprint of floating controls. Every interactive element must respect a minimum 44px touch target to ensure accessibility on mobile devices.

## Elevation & Depth

Hierarchy is established through **Backdrop Blurs** and **Subtle Inner Glows** rather than traditional drop shadows.

1.  **Base Layer:** The Deep Surface (#0F0D13) background.
2.  **Mid Layer:** Cards and secondary surfaces using Muted Slate (#2A2730) with a 1px "Glass Stroke" (White at 10% opacity) on the top and left edges to simulate light catching the rim.
3.  **Floating Layer:** Glassmorphic elements using a background blur (20px to 40px radius) and a semi-transparent fill.
4.  **Interaction Layer:** Soft Purple (#B8A5FF) used for glows behind active buttons, creating a "lifting" effect when pressed.

## Shapes

The shape language is defined by **ROUND_TWELVE (12px)** as the base radius. This provides a friendly, approachable aesthetic that feels natural in the hand.

- **Standard Cards/Buttons:** 12px (rounded-lg).
- **Outer Containers/Modals:** 24px (rounded-xl).
- **Utility Icons/Tags:** 8px (rounded-md).

Use continuous corner smoothing (squircle-inspired) where possible to maintain the "premium liquid" feel of the interface. Avoid sharp 90-degree angles entirely.

## Components

### Buttons
Primary buttons should be filled with the Soft Purple Accent (#B8A5FF) and use dark text (#0F0D13) for maximum contrast. Secondary buttons should use a glass effect (blurred background with a thin white stroke).

### Chips & Tags
Use Muted Slate (#2A2730) with 50% opacity and 8px corners. Active tags should transition to a Soft Purple border with a subtle 5% purple fill.

### Cards
Cards should never have a solid black background. Use Muted Slate with a 1px stroke at 12% opacity. If the card sits over an image, use the Glassmorphic style with a 32px backdrop blur.

### Input Fields
Inputs are bottom-aligned with a subtle underline in Muted Slate, or fully enclosed in a glass container. Focus states are indicated by the underline or border glowing in Soft Purple.

### AI Processing State
Instead of a standard spinner, use a fluid, pulsing gradient mesh that moves slowly behind a glassmorphic overlay. This reinforces the "smooth and premium" brand promise.