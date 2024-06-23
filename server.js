const NodeMediaServer = require('node-media-server');
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    allow_origin: '*',
  },
};

const nms = new NodeMediaServer(config);
nms.run();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket connection opened');
  let command;
  const stream = new PassThrough();

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const { rtmpUrl } = parsedMessage;
      console.log(`RTMP URL received: ${rtmpUrl}`);
      command = ffmpeg()
        .input(stream)
        .inputFormat('webm')
        // .videoCodec('libx264')
        // .audioCodec('aac')
        .outputOptions([
          '-f flv',
          '-preset veryfast',
          '-tune zerolatency',
          '-maxrate 3000k',
          '-bufsize 6000k',
          '-pix_fmt yuv420p',
          '-g 50',
          '-c:a aac',
          '-b:a 160k',
          '-ar 44100',
        ])
        .output(rtmpUrl)
        .on('start', () => {
          console.log('FFmpeg started');
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg stderr:', stderrLine);
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          ws.close();
        })
        .on('end', () => {
          console.log('FFmpeg ended');
        });

      command.run();
    } catch (error) {
      console.log('Received data chunk');
      stream.write(message);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    stream.end();
    if (command) {
      command.kill('SIGINT');
    }
  });
});

server.listen(8080, () => {
  console.log('WebSocket server is listening on port 8080');
});
