# pc-alexa

Stream PC audio to Amazon Echo devices via an Alexa Custom Skill.

Captures audio from a virtual audio cable with FFmpeg, encodes it as a low-latency MP3 stream, and serves it over HTTP. An Alexa skill directs Echo devices to play the live stream.

## Requirements

- Windows PC
- [VB-Cable](https://vb-audio.com/Cable/) — virtual audio cable to route PC audio
- [FFmpeg](https://ffmpeg.org/) available in PATH
- An HTTPS tunnel to expose the local server (e.g. [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), [ngrok](https://ngrok.com/))
- An [Alexa Developer account](https://developer.amazon.com/alexa/console/ask) to create the skill

## Setup

**1. Install dependencies**
```
npm install
```

**2. Find your audio device name**

Run the following and look for your virtual cable in the DirectShow audio devices list:
```
ffmpeg -list_devices true -f dshow -i dummy
```
The default device name is `CABLE Output (VB-Audio Virtual Cable)`.

**3. Configure environment**

Copy `.env.example` to `.env` and fill in your values:
```
BASE_URL=https://your-tunnel-url.example.com
```

See `.env.example` for all available options.

**4. Start your HTTPS tunnel**

Point it at the same port as `PORT` in your `.env` (default: `3000`). Example with Cloudflare Tunnel:
```
cloudflared tunnel run <tunnel-name>
```

**5. Create the Alexa skill**

- Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) and create a Custom Skill
- Under **Endpoint**, set the HTTPS URL to: `https://<your-tunnel-url>/alexa`
- Enable the **AudioPlayer** interface under **Interfaces**

**6. Start the server**
```
npm start
```

**7. Invoke the skill**

Say: **"Alexa, open \<your skill name\>"**

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BASE_URL` | Yes | — | Public HTTPS URL of your tunnel |
| `PORT` | No | `3000` | HTTP server port |
| `FFMPEG_DEVICE` | No | `CABLE Output (VB-Audio Virtual Cable)` | DirectShow audio device name |
| `STREAM_BASE_URL` | No | `BASE_URL` | Override the stream URL sent to Alexa (e.g. for LAN streaming) |
| `CERT_PATH` | No | — | Path to TLS cert folder for optional HTTPS server (`fullchain.pem` + `privkey.pem`) |
| `HTTPS_PORT` | No | `443` | Port for the optional HTTPS server |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Status dashboard |
| GET | `/stream` | Live MP3 audio stream |
| GET | `/start` | Start FFmpeg capture |
| GET | `/stop` | Stop FFmpeg capture |
| POST | `/alexa` | Alexa skill webhook |
