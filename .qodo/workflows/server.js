import express from "express";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import http from "http";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const SECRET = "mysecretkey";

let users = new Map(); // ws -> username

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get("/login", (req, res) => {
  const username = req.query.username || "guest";

  const token = jwt.sign({ username }, SECRET, {
    expiresIn: "1h",
  });

  res.json({ token });
});

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

function updateUsers() {
  const list = Array.from(users.values());
  broadcast({ type: "users", users: list });
}

wss.on("connection", (ws) => {

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      const decoded = jwt.verify(data.token, SECRET);
      const sender = decoded.username;

      if (!users.has(ws)) {
        users.set(ws, sender);

        broadcast({
          type: "system",
          message: `${sender} joined`
        });

        updateUsers();
      }

      const text = data.message;
      const time = new Date().toLocaleTimeString();

      // PRIVATE MESSAGE
      if (text.startsWith("/dm ")) {
        const parts = text.split(" ");
        const targetUser = parts[1];
        const dmMessage = parts.slice(2).join(" ");

        let sent = false;

        wss.clients.forEach((client) => {
          if (users.get(client) === targetUser && client.readyState === 1) {
            client.send(JSON.stringify({
              type: "dm",
              message: `(DM) ${sender}: ${dmMessage}`,
              time
            }));
            sent = true;
          }
        });

        if (sent) {
          ws.send(JSON.stringify({
            type: "dm",
            message: `(To ${targetUser}) You: ${dmMessage}`,
            time
          }));
        } else {
          ws.send(JSON.stringify({
            type: "error",
            message: "User not found"
          }));
        }

        return;
      }

      // PUBLIC CHAT
      broadcast({
        type: "chat",
        message: `${sender}: ${text}`,
        time
      });

    } catch (err) {
      ws.send(JSON.stringify({
        type: "error",
        message: "Authentication failed"
      }));
    }
  });

  ws.on("close", () => {
    const name = users.get(ws);
    users.delete(ws);

    if (name) {
      broadcast({
        type: "system",
        message: `${name} left`
      });

      updateUsers();
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running");
});