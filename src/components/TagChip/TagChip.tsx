import React from 'react';
import { Chip, Tooltip, ChipProps, SxProps, Theme } from '@mui/material';

// Tag format: [_][prefix:]<number|text>
// Examples:
//   "engagement:Low" -> displays "Low", tooltip "engagement:Low"
//   "engagement:3" -> displays "3" with green-to-red color based on number
//   "_engagement:1Partner" -> displays "Partner" with color for 1, shows in sidebar
//   "SimpleTag" -> displays "SimpleTag"

interface ParsedTag {
  original: string;
  showInSidebar: boolean; // starts with _
  prefix: string | null; // text before :
  displayText: string; // what to show
  numericValue: number | null; // leading number if present
}

/**
 * Parse a tag name into its components
 */
export function parseTagName(tagName: string): ParsedTag {
  let remaining = tagName;
  const showInSidebar = remaining.startsWith('_');
  if (showInSidebar) {
    remaining = remaining.slice(1);
  }

  let prefix: string | null = null;
  const colonIdx = remaining.indexOf(':');
  if (colonIdx !== -1) {
    prefix = remaining.slice(0, colonIdx);
    remaining = remaining.slice(colonIdx + 1);
  }

  // Check for leading numeric value
  const numericMatch = remaining.match(/^(\d+)(.*)$/);
  let numericValue: number | null = null;
  let displayText = remaining;

  if (numericMatch) {
    numericValue = parseInt(numericMatch[1], 10);
    // If there's text after the number, use that as display; otherwise show the number
    displayText = numericMatch[2] || numericMatch[1];
  }

  return {
    original: tagName,
    showInSidebar,
    prefix,
    displayText,
    numericValue,
  };
}

/**
 * Get background color based on numeric value (1-10 scale)
 * 1 = rich green, higher numbers transition to pale red
 */
export function getNumericColor(value: number): string {
  // Clamp value between 1 and 10
  const clamped = Math.max(1, Math.min(10, value));
  // Normalize to 0-1 range (1 -> 0, 10 -> 1)
  const normalized = (clamped - 1) / 9;

  // Green: hsl(120, 60%, 40%) -> Red: hsl(0, 50%, 75%)
  const hue = 120 - normalized * 120; // 120 (green) to 0 (red)
  const saturation = 60 - normalized * 10; // 60% to 50%
  const lightness = 40 + normalized * 35; // 40% to 75%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get text color for contrast against the background
 */
export function getTextColor(value: number): string {
  const clamped = Math.max(1, Math.min(10, value));
  // Darker backgrounds (low numbers) need white text
  // Lighter backgrounds (high numbers) need dark text
  return clamped <= 5 ? '#ffffff' : '#333333';
}

interface TagChipProps extends Omit<ChipProps, 'label'> {
  tagName: string;
  /** Override the size, defaults to 'small' */
  size?: 'small' | 'medium';
}

/**
 * A Chip component that handles fancy tag formatting:
 * - Prefix support (prefix:value) - prefix shown in tooltip only
 * - Numeric coloring (1=green, higher=red)
 * - Leading number extraction (_category:1Label shows "Label" colored by 1)
 */
export default function TagChip({ tagName, size = 'small', sx, ...props }: TagChipProps) {
  const parsed = parseTagName(tagName);

  const hasTooltip = parsed.prefix !== null;
  const tooltipText = parsed.prefix ? `${parsed.prefix}:${parsed.displayText}` : parsed.original;

  // Build chip styles
  let chipSx: SxProps<Theme> = sx || {};

  if (parsed.numericValue !== null) {
    const bgColor = getNumericColor(parsed.numericValue);
    const textColor = getTextColor(parsed.numericValue);
    chipSx = {
      ...chipSx,
      backgroundColor: bgColor,
      color: textColor,
      '& .MuiChip-deleteIcon': {
        color: textColor,
      },
    };
  }

  const chip = <Chip label={parsed.displayText} size={size} sx={chipSx} {...props} />;

  if (hasTooltip) {
    return (
      <Tooltip title={tooltipText} arrow>
        {chip}
      </Tooltip>
    );
  }

  return chip;
}
