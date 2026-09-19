import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

interface Peer {
  id: string;
  name: string;
  color: string;
  room: string;
  cursorLine?: number;
  isOwner?: boolean;
}

const rooms = new Map<string, Map<string, Peer>>(); // room -> (socketId -> peer)

function getRoom(room: string): Map<string, Peer> {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room)!;
}

function peersInRoom(room: string): Peer[] {
  return [...(getRoom(room).values())];
}

io.on("connection", (socket) => {
  console.log(`[sync] connect ${socket.id}`);

  let currentRoom: string | null = null;
  let currentPeer: Peer | null = null;

  socket.on("join", (data: { room: string; name: string; color: string; cursorLine?: number; isOwner?: boolean }) => {
    // leave previous room
    if (currentRoom) {
      socket.leave(currentRoom);
      getRoom(currentRoom).delete(socket.id);
      io.to(currentRoom).emit("peers", peersInRoom(currentRoom));
    }
    currentRoom = data.room;
    currentPeer = {
      id: socket.id,
      name: data.name,
      color: data.color,
      room: data.room,
      cursorLine: data.cursorLine,
      isOwner: data.isOwner,
    };
    socket.join(data.room);
    getRoom(data.room).set(socket.id, currentPeer);

    // notify everyone (including joiner) of the new peer list
    io.to(data.room).emit("peers", peersInRoom(data.room));
    // broadcast a system chat message
    socket.to(data.room).emit("chat", {
      id: "sys" + Date.now(),
      authorId: "system",
      authorName: "system",
      color: "#6d6d6d",
      body: `${data.name} joined the room`,
      ts: Date.now(),
      kind: "system",
    });
    console.log(`[sync] ${data.name} joined ${data.room} (${peersInRoom(data.room).length} online)`);
  });

  socket.on("cursor", (data: { line: number }) => {
    if (!currentRoom || !currentPeer) return;
    currentPeer.cursorLine = data.line;
    socket.to(currentRoom).emit("cursor", { id: socket.id, line: data.line });
  });

  socket.on("edit", (data: { fileId: string; content: string }) => {
    if (!currentRoom) return;
    // broadcast the edit to everyone else in the room
    socket.to(currentRoom).emit("edit", {
      id: socket.id,
      fileId: data.fileId,
      content: data.content,
      ts: Date.now(),
    });
  });

  socket.on("chat", (data: { body: string; codeBlock?: { lang: string; src: string } | null }) => {
    if (!currentRoom || !currentPeer) return;
    const msg = {
      id: "m" + Date.now() + Math.random().toString(36).slice(2, 6),
      authorId: socket.id,
      authorName: currentPeer.name,
      color: currentPeer.color,
      body: data.body,
      codeBlock: data.codeBlock ?? null,
      ts: Date.now(),
      kind: "user",
    };
    io.to(currentRoom).emit("chat", msg);
  });

  socket.on("voice-signal", (data: { target: string; signal: unknown }) => {
    if (!currentRoom) return;
    io.to(data.target).emit("voice-signal", {
      sender: socket.id,
      signal: data.signal,
    });
  });

  socket.on("voice-state", (data: { speaking: boolean; muted: boolean; deafened: boolean }) => {
    if (!currentRoom || !currentPeer) return;
    socket.to(currentRoom).emit("voice-state", {
      id: socket.id,
      speaking: data.speaking,
      muted: data.muted,
      deafened: data.deafened,
    });
  });

  socket.on("disconnect", () => {
    if (currentRoom && currentPeer) {
      getRoom(currentRoom).delete(socket.id);
      io.to(currentRoom).emit("peers", peersInRoom(currentRoom));
      socket.to(currentRoom).emit("chat", {
        id: "sys" + Date.now(),
        authorId: "system",
        authorName: "system",
        color: "#6d6d6d",
        body: `${currentPeer.name} left the room`,
        ts: Date.now(),
        kind: "system",
      });
      console.log(`[sync] ${currentPeer.name} left ${currentRoom} (${peersInRoom(currentRoom).length} online)`);
      // clean up empty rooms
      if (getRoom(currentRoom).size === 0) {
        rooms.delete(currentRoom);
        console.log(`[sync] room ${currentRoom} emptied and cleaned up`);
      }
    }
    console.log(`[sync] disconnect ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[anonshare-sync] listening on :${PORT}`);
  console.log(`[anonshare-sync] websocket path: /?XTransformPort=${PORT}`);
});
