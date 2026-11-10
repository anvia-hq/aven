import { safeStorage } from "@/hooks/use-local-storage";

const KEY = "aven.finished-sound";

export const finishedSoundOn = () => safeStorage.getItem(KEY) !== "off";
export const setFinishedSound = (on: boolean) => safeStorage.setItem(KEY, on ? "on" : "off");

let context: AudioContext | undefined;

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
      gain.gain.linearRampToValueAtTime(0.15, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  } catch {}
}

export function playMention() {
  try {
    context ??= new AudioContext();
    const audio = context;
    void audio.resume();
    const at = audio.currentTime + 0.02;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 659.25;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.07, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.32);
  } catch {}
}
