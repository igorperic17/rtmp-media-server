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
    let stringMessage;
    if (Buffer.isBuffer(message)) {
      stringMessage = message.toString();
    } else {
      stringMessage = message;
    }

    if (stringMessage.includes('rtmpUrl')) {
      console.log("received server url")
      try {
        const { rtmpUrl } = JSON.parse(stringMessage);
        console.log(`Received RTMP URL: ${rtmpUrl}`);
        command = ffmpeg()
          .input(stream)
          .inputFormat('webm')
          .videoCodec('libx264')
          .audioCodec('aac')
          .format('flv')
          .outputOptions('-preset', 'veryfast')
          .outputOptions('-tune', 'zerolatency')
          .output(rtmpUrl)
          .on('start', () => {
            console.log('FFmpeg started with URL:', rtmpUrl);
          })
          .on('codecData', (data) => {
            console.log('Input is', data);
          })
          .on('progress', (progress) => {
            console.log('Processing: ' + progress.percent + '% done');
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err.message);
            ws.close();
          })
          .on('end', () => {
            console.log('FFmpeg ended');
          });

        command.run();
      } catch (error) {
        console.error('Error parsing RTMP URL message:', error);
      }
    } else {
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
