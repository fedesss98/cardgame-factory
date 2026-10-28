import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  isLightColor,
  themeWarnings,
  themePresets,
} from "./theme.ts";

test("contrast ratio follows the WCAG extremes", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(Math.round(contrastRatio("#ffffff", "#ffffff")), 1);
  const midGray = contrastRatio("#777777", "#ffffff");
  assert.ok(midGray > 4.4 && midGray < 4.6);
});

test("light backgrounds are detected", () => {
  assert.equal(isLightColor("#ffffff"), true);
  assert.equal(isLightColor("#000000"), false);
  assert.equal(isLightColor("#f7eed9"), true);
});

test("built-in presets have readable card text and page labels", () => {
  for (const preset of themePresets) {
    assert.deepEqual(themeWarnings(preset.theme), [], preset.label);
  }
});

test("low-contrast themes produce actionable warnings", () => {
  const warnings = themeWarnings({
    preset: "minimal",
    background: "#777777",
    surface: "#888888",
    text: "#999999",
    accent: "#777777",
    font: "system-sans",
  });
  assert.ok(warnings.some((warning) => warning.includes("Card text")));
  assert.ok(warnings.some((warning) => warning.includes("Surface text")));
  assert.ok(warnings.some((warning) => warning.includes("accent")));
});
