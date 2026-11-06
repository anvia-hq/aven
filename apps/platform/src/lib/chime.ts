import { safeStorage } from "@/hooks/use-local-storage";

const KEY = "aven.finished-sound";

/** Whether the person wants the sound; on until they switch it off. Kept on this device only. */
export const finishedSoundOn = () => safeStorage.getItem(KEY) !== "off";
export const setFinishedSound = (on: boolean) => safeStorage.setItem(KEY, on ? "on" : "off");

let context: AudioContext | undefined;

// A soft two-note chime made with the browser's own audio, so there is no file to load: sine tones a
// fifth apart that fade in and out within half a second, quiet enough to hear without being startled.
export function playChime() {
  try {
    context ??= new AudioContext();
    const audio = context;
    void audio.resume();
    const start = audio.currentTime + 0.02;
    [523.25, 783.99].forEach((frequency, index) => {
      const at = start + index * 0.14;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.05, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  } catch {
    // No audio, or the browser has not allowed it yet: silence is fine.
  }
}
