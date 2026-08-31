import type { ManualAudiobookInput } from "./types";
import { isValidHttpUrl } from "./util";

export type ManualAudiobookValidationError = "manual.needsTitle" | "manual.needsValidLink";

export function validateManualAudiobookInput(
  input: ManualAudiobookInput
): ManualAudiobookValidationError | null {
  if (!input.title.trim()) return "manual.needsTitle";
  const link = input.sourceLink?.trim() || "";
  if (link && !isValidHttpUrl(link)) return "manual.needsValidLink";
  return null;
}
