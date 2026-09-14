import { Room, RoomEvent, Track } from "livekit-client";
import { conceptMediaService } from "./conceptMediaService";

export interface VoiceSession {
  room: Room;
  roomName: string;
  disconnect: () => void;
}

export async function connectVoiceMentor(
  conceptId: string,
  language: string | undefined,
  onAudio: (track: MediaStreamTrack) => void,
  onState?: (s: "connecting" | "live" | "ended" | "error") => void
): Promise<VoiceSession> {
  onState?.("connecting");
  const { token, room: roomName, url } = await conceptMediaService.getVoiceToken(conceptId, language);
  if (!url) throw new Error("LiveKit is not configured for this deployment.");
  const room = new Room();
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      document.body.appendChild(el);
      if (el.srcObject) {
        const [t] = (el.srcObject as MediaStream).getAudioTracks();
        if (t) onAudio(t);
      }
    }
  });
  room.on(RoomEvent.Disconnected, () => {
    audioEl.remove();
    onState?.("ended");
  });
  try {
    await room.prepareConnection(url);
    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (e) {
    onState?.("error");
    throw e;
  }
  onState?.("live");
  return { room, roomName, disconnect: () => room.disconnect() };
}
