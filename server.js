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
    // Check if message is a Buffer and try to parse it as JSON
    try {
      const jsonString = message.toString('utf8');
      const { rtmpUrl } = JSON.parse(jsonString);
      console.log(`Received RTMP URL: ${rtmpUrl}`);
      command = ffmpeg()
        .input(stream)
        .inputFormat('webm')
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('flv')
        .outputOptions('-preset', 'veryfast')
        .outputOptions('-tune', 'zerolatency')
        .outputOptions('-f', 'flv')
        .outputOptions('-g', '50')
        .outputOptions('-keyint_min', '50')
        .outputOptions('-sc_threshold', '0')
        .outputOptions('-b:v', '2500k')
        .outputOptions('-maxrate', '2500k')
        .outputOptions('-bufsize', '5000k')
        .outputOptions('-b:a', '128k')
        .output(rtmpUrl)
        .on('start', () => {
          console.log(`FFmpeg started with URL: ${rtmpUrl}`);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg STDERR:', stderrLine);
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
      // If JSON parsing fails, treat it as media data
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
