# pc-alexa

Stream PC audio to Amazon Echo Dots via an Alexa Custom Skill.

Captures the VB-Audio Virtual Cable output with FFmpeg, encodes it as a low-latency MP3 stream, and exposes it over HTTP. An Alexa skill directs Echo devices to play the stream.

## Requirements

- [VB-Cable](https://vb-audio.com/Cable/) — route PC audio through the virtual cable
- [FFmpeg](https://ffmpeg.org/) in PATH
- [ngrok](https://ngrok.com/) (or any HTTPS tunnel) to expose the local server

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file:
   ```
   NGROK_URL=https://your-tunnel.ngrok-free.app
   PORT=3000
   ```

3. Start ngrok:
   ```
   ngrok http 3000
   ```

4. In the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), create a Custom Skill and set the endpoint to `https://<ngrok-url>/alexa`.

5. Start the server:
   ```
   npm start
   ```

6. Say **"Alexa, open \<your skill name\>"**.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Status dashboard |
| GET | `/stream` | Live MP3 audio stream |
| GET | `/start` | Start FFmpeg capture |
| GET | `/stop` | Stop FFmpeg capture |
| POST | `/alexa` | Alexa skill webhook |
