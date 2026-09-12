"""
VEXYL-STT Plugin for LiveKit Agents
=====================================
Custom STT plugin that connects to a self-hosted VEXYL-STT WebSocket server
(github.com/vexyl-ai/vexyl-stt) running AI4Bharat's indic-conformer-600m-multilingual model.

Implements LiveKit's STT interface for seamless drop-in replacement of cloud STT providers.
"""

import asyncio
import json
import logging
import os
from typing import Optional

import websockets
from livekit import rtc
from livekit.agents import stt, utils
from livekit.agents._exceptions import APIConnectionError
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
)
from livekit.agents.utils import is_given

logger = logging.getLogger("vexyl_stt_plugin")

# VEXYL-STT requires 16kHz mono PCM audio
TARGET_SAMPLE_RATE = 16000


class VexylSTT(stt.STT):
    """
    LiveKit STT plugin for VEXYL-STT server.

    Configuration via environment variables:
        VEXYL_STT_HOST (default: 127.0.0.1)
        VEXYL_STT_PORT (default: 8091)
        VEXYL_STT_LANG (default: hi-IN)  # Hindi-India
    """

    def __init__(
        self,
        *,
        language: str = "hi-IN",
        host: Optional[str] = None,
        port: Optional[int] = None,
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=False,  # VEXYL-STT only sends final after VAD silence
            )
        )

        self._language = language or os.getenv("VEXYL_STT_LANG", "hi-IN")
        self._host = host or os.getenv("VEXYL_STT_HOST", "127.0.0.1")
        self._port = port or int(os.getenv("VEXYL_STT_PORT", "8091"))
        self._ws_url = f"ws://{self._host}:{self._port}"

        # Track the last detected language from responses
        self._last_detected_language: Optional[str] = None

        logger.info(
            f"VexylSTT initialized: {self._ws_url}, language={self._language}"
        )

    @property
    def last_detected_language(self) -> Optional[str]:
        """
        Get the language code from the most recent final transcript.
        Useful for dynamic TTS language switching.
        """
        return self._last_detected_language

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        """
        Batch recognition is not supported by VEXYL-STT.
        Use stream() instead.
        """
        raise NotImplementedError(
            "VEXYL-STT does not support batch recognition, use stream() instead"
        )

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "VexylSTTStream":
        """
        Create a streaming recognition session.

        Args:
            language: Override the default language for this stream.
            conn_options: Connection options for retry/timeout behavior.

        Returns:
            VexylSTTStream instance.
        """
        effective_language = language if is_given(language) else self._language
        return VexylSTTStream(
            stt=self,
            language=effective_language,
            ws_url=self._ws_url,
            conn_options=conn_options,
        )


class VexylSTTStream(stt.SpeechStream):
    """
    Streaming recognition session for VEXYL-STT.

    IMPORTANT LIMITATION:
    ---------------------
    VEXYL-STT uses internal VAD (Voice Activity Detection) and only emits final
    transcripts AFTER detecting silence (default: 0.6s of silence after speech).

    This means:
      - No interim/partial results while user is speaking
      - LiveKit's turn detection is bottlenecked by VEXYL-STT's silence timeout
      - Cannot achieve sub-200ms "instant" responsiveness like cloud STT providers

    Trade-off:
      - ✓ Zero cost, full data privacy, supports 14 Indian languages
      - ✗ Higher end-of-speech latency (~600-800ms vs ~80-150ms for Deepgram)
    """

    def __init__(
        self,
        *,
        stt: VexylSTT,
        language: str,
        ws_url: str,
        conn_options: APIConnectOptions,
    ):
        # Pass sample_rate=16000 so the base class auto-resamples input to 16kHz
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=TARGET_SAMPLE_RATE)

        self._stt = stt
        self._language = language
        self._ws_url = ws_url
        self._session_id = f"livekit_{utils.shortuuid()}"

        # WebSocket state
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._speaking = False

        logger.info(f"VexylSTTStream created | session_id={self._session_id}")

    async def _connect(self) -> websockets.WebSocketClientProtocol:
        """
        Establish WebSocket connection to VEXYL-STT server.

        Returns:
            Connected WebSocket.

        Raises:
            APIConnectionError: If connection fails.
        """
        try:
            logger.info(f"Connecting to VEXYL-STT: {self._ws_url}")

            ws = await asyncio.wait_for(
                websockets.connect(self._ws_url),
                timeout=self._conn_options.timeout,
            )

            # Wait for server's initial "ready" message
            ready_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            ready_data = json.loads(ready_msg)

            if ready_data.get("type") != "ready":
                logger.warning(f"Unexpected initial message: {ready_msg}")

            # Send "start" message to initialize session
            start_msg = {
                "type": "start",
                "lang": self._language,
                "session_id": self._session_id,
            }
            await ws.send(json.dumps(start_msg))

            logger.info(
                f"✓ Connected to VEXYL-STT | session={self._session_id} | lang={self._language}"
            )

            return ws

        except asyncio.TimeoutError as e:
            raise APIConnectionError(
                f"Connection timeout: {self._ws_url}"
            ) from e
        except ConnectionRefusedError as e:
            raise APIConnectionError(
                f"Connection refused: {self._ws_url} "
                "(Is VEXYL-STT server running? cd ../vexyl-stt && ./run.sh)"
            ) from e
        except Exception as e:
            raise APIConnectionError(
                f"Connection error: {e}"
            ) from e

    async def _run(self) -> None:
        """Main control loop: establish connection and process audio."""
        closing_ws = False
        ws = await self._connect()
        self._ws = ws

        async def send_task() -> None:
            """Send audio frames from LiveKit to VEXYL-STT WebSocket."""
            nonlocal closing_ws

            try:
                async for frame in self._input_ch:
                    if isinstance(frame, rtc.AudioFrame):
                        # AudioFrame.data is a memoryview of int16 PCM samples.
                        # VEXYL-STT expects raw 16-bit PCM bytes — send directly.
                        pcm_bytes = frame.data.tobytes()
                        await ws.send(pcm_bytes)

                    elif isinstance(frame, self._FlushSentinel):
                        # End of a speech segment — nothing extra needed for VEXYL-STT
                        # since it uses its own internal VAD for segmentation.
                        pass

                # Input channel closed — send stop to flush any remaining audio
                closing_ws = True
                stop_msg = {"type": "stop"}
                await ws.send(json.dumps(stop_msg))

                # Give server time to send final flush transcript
                await asyncio.sleep(0.5)

            except (websockets.exceptions.ConnectionClosed, ConnectionError) as e:
                if closing_ws:
                    return
                raise APIConnectionError(
                    "VEXYL-STT WebSocket connection closed unexpectedly"
                ) from e

        async def recv_task() -> None:
            """Receive transcript JSON messages from VEXYL-STT and emit events."""
            nonlocal closing_ws

            try:
                async for message in ws:
                    if not isinstance(message, str):
                        # Binary message — skip (we only expect JSON text)
                        continue

                    try:
                        data = json.loads(message)
                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON from server: {message}")
                        continue

                    msg_type = data.get("type")

                    if msg_type == "final":
                        self._process_final_transcript(data)

                    elif msg_type == "error":
                        error_msg = data.get("message", "Unknown error")
                        logger.error(f"VEXYL-STT error: {error_msg}")

                    elif msg_type in ("ready", "started", "stopped"):
                        # Server lifecycle messages — log at debug level
                        logger.debug(f"VEXYL-STT: {msg_type}")

                    else:
                        logger.warning(f"Unknown message type: {msg_type}")

            except websockets.exceptions.ConnectionClosed:
                if closing_ws:
                    return
                raise APIConnectionError(
                    "VEXYL-STT WebSocket connection closed unexpectedly"
                )

        try:
            tasks = [
                asyncio.create_task(send_task()),
                asyncio.create_task(recv_task()),
            ]
            try:
                await asyncio.gather(*tasks)
            finally:
                await utils.aio.gracefully_cancel(*tasks)
        finally:
            self._ws = None
            await ws.close()
            logger.info(f"WebSocket closed | session={self._session_id}")

    def _process_final_transcript(self, data: dict) -> None:
        """Process a final transcript from VEXYL-STT and emit speech events."""
        text = data.get("text", "").strip()
        detected_lang = data.get("lang", self._language)
        latency_ms = data.get("latency_ms", 0)
        duration_s = data.get("duration", 0.0)

        if not text:
            return

        logger.info(
            f"[VEXYL] Final: '{text}' | lang={detected_lang} | "
            f"latency={latency_ms}ms | audio={duration_s:.1f}s"
        )

        # Store detected language for external access
        self._stt._last_detected_language = detected_lang

        # Emit START_OF_SPEECH if not already speaking
        # (VEXYL-STT doesn't send separate start-of-speech signals,
        # so we emit it with the first transcript)
        if not self._speaking:
            self._speaking = True
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.START_OF_SPEECH,
                )
            )

        # Emit final transcript
        self._event_ch.send_nowait(
            stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[
                    stt.SpeechData(
                        text=text,
                        language=detected_lang,
                    )
                ],
            )
        )

        # Emit END_OF_SPEECH (each VEXYL-STT final = one complete utterance)
        if self._speaking:
            self._speaking = False
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.END_OF_SPEECH,
                )
            )
