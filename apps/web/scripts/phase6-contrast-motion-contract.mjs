import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const css = read('src/app/globals.css');
const ui = read('src/components/ui.tsx');
const statusBadges = read('src/components/status-badge.tsx');
const executorOrder = read('src/app/(executor)/executor/orders/[id]/page.tsx');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function themeBlock(pattern, name) {
  const match = css.match(pattern);
  check(match, `${name} theme block is missing.`);
  const variables = {};
  for (const entry of (match?.[1] ?? '').matchAll(/--color-([\w-]+):\s*(#[\da-fA-F]{3,8})\s*;/g)) {
    variables[entry[1]] = entry[2];
  }
  return variables;
}

function luminance(hex) {
  const normalized = hex.length === 4
    ? `#${[...hex.slice(1)].map((value) => value + value).join('')}`
    : hex.slice(0, 7);
  const channels = normalized.slice(1).match(/../g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const light = themeBlock(/\[data-theme='simple-light'\],\s*:root\s*\{([\s\S]*?)\n\}/, 'Light');
const dark = themeBlock(/\[data-theme='simple-dark'\]\s*\{([\s\S]*?)\n\}/, 'Dark');
const textPairs = [
  ['fg', 'surface'],
  ['fg-muted', 'surface'],
  ['fg-subtle', 'surface'],
  ['accent', 'surface'],
  ['fg-on-accent', 'accent'],
  ['fg-on-danger', 'danger'],
  ['success', 'success-subtle'],
  ['warning', 'warning-subtle'],
  ['danger', 'danger-subtle'],
  ['info', 'info-subtle'],
  ['purple', 'purple-subtle'],
];

for (const [themeName, tokens] of [['light', light], ['dark', dark]]) {
  for (const [foreground, background] of textPairs) {
    const ratio = contrast(tokens[foreground], tokens[background]);
    check(ratio >= 4.5, `${themeName} ${foreground}/${background} contrast is ${ratio.toFixed(2)}; expected at least 4.5.`);
  }
  const controlRatio = contrast(tokens['form-border'], tokens.surface);
  check(controlRatio >= 3, `${themeName} form-border/surface contrast is ${controlRatio.toFixed(2)}; expected at least 3.0.`);
}

check(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css), 'Reduced-motion media query is required.');
check(/animation-duration:\s*0\.01ms\s*!important/.test(css), 'Reduced motion must suppress animations.');
check(/transition-duration:\s*0\.01ms\s*!important/.test(css), 'Reduced motion must suppress transitions.');
check(/scroll-behavior:\s*auto\s*!important/.test(css), 'Reduced motion must disable smooth scrolling.');
check(!css.includes('--motion-duration-fast') && !css.includes('--motion-easing-standard'), 'Motion styles must use defined design tokens.');

check(/danger:\s*'bg-danger text-fg-on-danger/.test(ui), 'Danger controls must use the theme-specific on-danger text token.');
check(/BADGE_COLORS[\s\S]*border border-/.test(ui) && /\{children\}/.test(ui), 'Badges must combine text labels with a non-color boundary.');
check(statusBadges.includes('ORDER_STATUS_LABELS_FA[status]') && statusBadges.includes('TICKET_STATUS_LABELS_FA[status]'), 'Status badges must expose textual labels instead of color alone.');
check(/role="progressbar"[\s\S]{0,180}aria-valuenow=/.test(executorOrder), 'Visual progress must expose a numeric progressbar value.');
check(!executorOrder.includes('bg-success-subtle0'), 'Unknown color utility typo must not return.');

if (failures.length) {
  console.error(`Phase 6 contrast/motion contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Phase 6 contrast/motion contract passed: ${textPairs.length * 2} text pairs, 2 control boundaries, textual state cues and reduced motion verified.`);
