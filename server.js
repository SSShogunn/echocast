'use strict';

const express = require('express');
const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const config = {
  baseUrl:      process.env.BASE_URL      || 'https://your-tunnel-url.example.com',
  streamBaseUrl:process.env.STREAM_BASE_URL || process.env.BASE_URL || 'https://your-tunnel-url.example.com',
  port:         process.env.PORT          || 3000,
  httpsPort:    process.env.HTTPS_PORT    || 443,
  ffmpegDevice: process.env.FFMPEG_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)',
  certPath:     process.env.CERT_PATH     || null,
  streamPath:   '/stream',
};

if (!process.env.BASE_URL) {
  console.warn('[Config] Warning: BASE_URL is not set in .env');
}

let ffmpegProcess = null;
let streamClients = [];

function startFFmpeg() {
  if (ffmpegProcess) return;

  console.log(`[FFmpeg] Starting capture from: ${config.ffmpegDevice}`);

  ffmpegProcess = spawn('ffmpeg', [
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-probesize', '32',
    '-analyzeduration', '0',
    '-f', 'dshow',
    '-rtbufsize', '64k',
    '-thread_queue_size', '512',
    '-i', `audio=${config.ffmpegDevice}`,
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-ac', '2',
    '-ar', '44100',
    '-reservoir', '0',
    '-write_xing', '0',
    '-f', 'mp3',
    '-flush_packets', '1',
    'pipe:1',
  ]);

  ffmpegProcess.stdout.on('data', (chunk) => {
    for (let i = streamClients.length - 1; i >= 0; i--) {
      const res = streamClients[i];
      if (res.writableEnded) streamClients.splice(i, 1);
      else res.write(chunk);
    }
  });

  ffmpegProcess.stderr.resume();

  ffmpegProcess.on('close', (code) => {
    console.log(`[FFmpeg] Exited with code ${code}`);
    ffmpegProcess = null;
    streamClients.forEach((res) => { if (!res.writableEnded) res.end(); });
    streamClients = [];
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[FFmpeg] Failed to start:', err.message);
    ffmpegProcess = null;
  });
}

function stopFFmpeg() {
  if (!ffmpegProcess) return;
  console.log('[FFmpeg] Stopping...');
  ffmpegProcess.kill('SIGTERM');
  ffmpegProcess = null;
}

const app = express();
app.use(express.json());

app.get(config.streamPath, (req, res) => {
  console.log(`[Stream] Client connected: ${req.ip}`);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.socket) req.socket.setNoDelay(true);

  streamClients.push(res);

  if (!ffmpegProcess) startFFmpeg();

  req.on('close', () => {
    const idx = streamClients.indexOf(res);
    if (idx !== -1) streamClients.splice(idx, 1);
  });
});

app.get('/start', (req, res) => {
  startFFmpeg();
  res.send('FFmpeg started. Stream at ' + config.streamBaseUrl + config.streamPath);
});

app.get('/stop', (req, res) => {
  stopFFmpeg();
  res.send('FFmpeg stopped.');
});

app.get('/', (req, res) => {
  const streamUrl = `${config.streamBaseUrl}${config.streamPath}`;
  const isRunning = !!ffmpegProcess;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PC → Alexa Audio Stream</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; background: #f5f5f5; }
    h1 { font-size: 1.5rem; }
    .status { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: bold;
              background: ${isRunning ? '#d4edda' : '#f8d7da'};
              color: ${isRunning ? '#155724' : '#721c24'}; }
    .url { background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 6px;
           word-break: break-all; font-family: monospace; margin: 16px 0; }
    button { padding: 10px 22px; margin: 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    .btn-start { background: #28a745; color: #fff; }
    .btn-stop  { background: #dc3545; color: #fff; }
    .clients   { margin-top: 20px; color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>PC → Alexa Audio Stream</h1>
  <p>Status: <span class="status">${isRunning ? 'STREAMING' : 'STOPPED'}</span></p>
  <p>Stream URL:</p>
  <div class="url">${streamUrl}</div>
  <p class="clients">Connected clients: ${streamClients.length}</p>
  <form action="/start" method="get" style="display:inline">
    <button class="btn-start" type="submit">&#9654; Start</button>
  </form>
  <form action="/stop" method="get" style="display:inline">
    <button class="btn-stop" type="submit">&#9632; Stop</button>
  </form>
</body>
</html>`);
});

app.post('/alexa', (req, res) => {
  const body = req.body;

  if (!body || !body.request) {
    return res.status(400).json({ error: 'Invalid Alexa request' });
  }

  const reqType = body.request.type;
  const intentName = reqType === 'IntentRequest' ? body.request.intent?.name : null;

  console.log(`[Alexa] ${reqType}${intentName ? ' / ' + intentName : ''}`);

  function playResponse(speechText) {
    const streamUrl = `${config.streamBaseUrl}${config.streamPath}`;
    return {
      version: '1.0',
      response: {
        outputSpeech: speechText ? { type: 'PlainText', text: speechText } : undefined,
        directives: [{
          type: 'AudioPlayer.Play',
          playBehavior: 'REPLACE_ALL',
          audioItem: {
            stream: {
              url: streamUrl,
              token: 'pc-audio-stream',
              offsetInMilliseconds: 0,
            },
            metadata: {
              title: 'PC Audio',
              subtitle: 'Live stream from your PC',
            },
          },
        }],
      },
    };
  }

  function stopResponse(speechText) {
    return {
      version: '1.0',
      response: {
        outputSpeech: speechText ? { type: 'PlainText', text: speechText } : undefined,
        directives: [{ type: 'AudioPlayer.Stop' }],
      },
    };
  }

  function ackResponse() {
    return { version: '1.0', response: {} };
  }

  if (reqType === 'LaunchRequest') {
    return res.json(playResponse('Starting your PC audio stream.'));
  }

  if (reqType === 'IntentRequest') {
    switch (intentName) {
      case 'StartStreamIntent':
        return res.json(playResponse('Starting your PC audio stream.'));
      case 'StopStreamIntent':
      case 'AMAZON.StopIntent':
      case 'AMAZON.PauseIntent':
        return res.json(stopResponse('Stopping the stream.'));
      case 'AMAZON.ResumeIntent':
        return res.json(playResponse(null));
      default:
        return res.json({
          version: '1.0',
          response: {
            outputSpeech: { type: 'PlainText', text: "Sorry, I didn't understand that. Try saying start or stop." },
            shouldEndSession: false,
          },
        });
    }
  }

  if (
    reqType === 'AudioPlayer.PlaybackStarted'  ||
    reqType === 'AudioPlayer.PlaybackFinished' ||
    reqType === 'AudioPlayer.PlaybackStopped'  ||
    reqType === 'AudioPlayer.PlaybackNearlyFinished'
  ) {
    return res.json(ackResponse());
  }

  if (reqType === 'AudioPlayer.PlaybackFailed') {
    const err = body.request.error;
    console.error(`[Alexa] PlaybackFailed — ${err?.type}: ${err?.message}`);
    return res.json(ackResponse());
  }

  if (reqType === 'SessionEndedRequest') return res.json(ackResponse());
  if (reqType === 'PlaybackController.PlayCommandIssued') return res.json(playResponse(null));
  if (reqType === 'PlaybackController.PauseCommandIssued') return res.json(stopResponse(null));

  console.warn(`[Alexa] Unhandled: ${reqType}`);
  return res.json(ackResponse());
});

app.listen(config.port, () => {
  console.log('='.repeat(60));
  console.log(' PC → Alexa Audio Stream Server');
  console.log('='.repeat(60));
  console.log(` HTTP:       http://localhost:${config.port}`);
  console.log(` Stream:     ${config.streamBaseUrl}${config.streamPath}`);
  console.log(` Alexa POST: ${config.baseUrl}/alexa`);
  console.log('='.repeat(60));
  console.log('[Boot] Pre-starting FFmpeg capture...');
  startFFmpeg();
});

// Optional HTTPS server — only starts if CERT_PATH is set in .env
if (config.certPath) {
  try {
    const tlsOptions = {
      cert: fs.readFileSync(`${config.certPath}/fullchain.pem`),
      key:  fs.readFileSync(`${config.certPath}/privkey.pem`),
    };
    https.createServer(tlsOptions, app).listen(config.httpsPort, () => {
      console.log(`[HTTPS] Listening on port ${config.httpsPort}`);
    });
  } catch (err) {
    console.error('[HTTPS] Failed to load cert:', err.message);
  }
}
