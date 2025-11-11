import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ルーム管理
const rooms = new Map();

app.get('/', (req, res) => {
  res.send('Mini Shogi Server is running!');
});

wss.on('connection', (ws) => {
  console.log('New client connected');
  let currentRoom = null;
  let playerRole = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'create-room') {
        const roomId = data.roomId;
        rooms.set(roomId, {
          players: [ws],
          board: data.board,
          currentPlayer: 1,
          captured1: [],
          captured2: []
        });
        currentRoom = roomId;
        playerRole = 1;
        
        ws.send(JSON.stringify({
          type: 'room-created',
          roomId: roomId
        }));
        console.log('Room created:', roomId);
      }

      else if (data.type === 'join-room') {
        const roomId = data.roomId;
        const room = rooms.get(roomId);

        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'ルームが見つかりません'
          }));
          return;
        }

        if (room.players.length >= 2) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'ルームが満員です'
          }));
          return;
        }

        room.players.push(ws);
        currentRoom = roomId;
        playerRole = 2;

        // 両プレイヤーにゲーム開始を通知
        room.players.forEach((client, index) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'game-start',
              board: room.board,
              playerRole: index + 1
            }));
          }
        });
        console.log('Player joined room:', roomId);
      }

      else if (data.type === 'move') {
        const room = rooms.get(currentRoom);
        if (!room) return;

        // 盤面状態を更新
        room.board = data.board;
        room.currentPlayer = data.currentPlayer;
        room.captured1 = data.captured1;
        room.captured2 = data.captured2;

        // 相手プレイヤーに送信
        room.players.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'opponent-move',
              board: data.board,
              currentPlayer: data.currentPlayer,
              captured1: data.captured1,
              captured2: data.captured2,
              winner: data.winner
            }));
          }
        });
      }

      else if (data.type === 'reset') {
        const room = rooms.get(currentRoom);
        if (!room) return;

        room.board = data.board;
        room.currentPlayer = 1;
        room.captured1 = [];
        room.captured2 = [];

        // 両プレイヤーに通知
        room.players.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'game-reset',
              board: data.board
            }));
          }
        });
      }

    } catch (error) {
      console.error('Error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        // 相手に切断を通知
        room.players.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'opponent-disconnected'
            }));
          }
        });
        // ルームを削除
        rooms.delete(currentRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```

