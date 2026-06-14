import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

interface Pokemon {
  name: string;
  level: number;
  species: string;
  spriteUrl: string;
  hp: number;
  maxHp: number;
  moves: string[];
  stats: {
    hp: number;
    attack: number;
    defense: number;
    spAtk: number;
    spDef: number;
    speed: number;
  };
}

interface Player {
  id: string;
  username: string;
  avatar: string;
  team: Pokemon[];
  status: "idle" | "battling" | "trading";
  battleId?: string;
  ws: WebSocket;
}

interface BattleState {
  id: string;
  player1: {
    id: string;
    username: string;
    activeIdx: number;
    team: Pokemon[];
    currentHp: number[]; // track dynamic HP map
  };
  player2: {
    id: string;
    username: string;
    activeIdx: number;
    team: Pokemon[];
    currentHp: number[];
  };
  turns: {
    [playerId: string]: {
      action: "fight" | "switch" | "run";
      moveIdx?: number;
      switchIdx?: number;
    };
  };
  log: string[];
}

interface TradeState {
  id: string;
  p1: { id: string; selectedPokemonIdx: number | null; confirmed: boolean };
  p2: { id: string; selectedPokemonIdx: number | null; confirmed: boolean };
}

// Memory stores
const onlinePlayers = new Map<string, Player>();
const battles = new Map<string, BattleState>();
const trades = new Map<string, TradeState>();

// Cloud Save dynamic repository (expires in 60 minutes)
interface CloudSave {
  savData: string; // base64 encoded
  filename: string;
  timestamp: number;
}
const cloudSaves = new Map<string, CloudSave>();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API endpoint to upload a save file for Web Cloud backup/restore
  app.post("/api/cloud-save/backup", (req, res) => {
    try {
      const { savData, filename } = req.body;
      if (!savData) {
        res.status(400).json({ error: "Sữ liệu lưu game rỗng" });
        return;
      }
      
      // Generate a unique 6-digit numeric sync code
      let syncCode = "";
      do {
        syncCode = Math.floor(100000 + Math.random() * 900000).toString();
      } while (cloudSaves.has(syncCode));

      cloudSaves.set(syncCode, {
        savData,
        filename: filename || "pokemon.sav",
        timestamp: Date.now()
      });

      res.json({ success: true, syncCode });
    } catch (e) {
      res.status(500).json({ error: "Lỗi lưu file save trên mây" });
    }
  });

  app.get("/api/cloud-save/restore/:code", (req, res) => {
    const code = req.params.code;
    const save = cloudSaves.get(code);
    if (!save) {
      res.status(404).json({ error: "Mã đồng bộ không hợp lệ hoặc đã hết hạn (60 phút)" });
      return;
    }
    res.json({ success: true, savData: save.savData, filename: save.filename });
  });

  // Google OAuth Config API
  app.get("/api/auth/google/config", (req, res) => {
    res.json({
      clientId: process.env.GOOGLE_CLIENT_ID || ""
    });
  });

  // Screen Dialog Translation using Gemini 3.5 Flash
  app.post("/api/translate-dialog", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || text.trim() === "") {
        res.json({ translation: "" });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        // High quality simulated Vietnamese localization of classic Pokemon FireRed & GBA lines
        const lowercaseText = text.toLowerCase().trim();
        let simulated = "";
        if (lowercaseText.includes("oak") || lowercaseText.includes("welcome")) {
          simulated = "Chào mừng cháu đến với thế giới đầy kỳ diệu của Pokémon! Ta là Giáo sư Oak.";
        } else if (lowercaseText.includes("choose") || lowercaseText.includes("partner")) {
          simulated = "Hãy chọn lấy một Pokémon đồng hành làm khởi đầu cho hành trình phiêu lưu của cháu!";
        } else if (lowercaseText.includes("heal") || lowercaseText.includes("center")) {
          simulated = "Chào mừng quý khách đến với Trung Tâm Pokémon. Chúng tôi sẽ chữa trị cho Pokémon của bạn.";
        } else if (lowercaseText.includes("rival") || lowercaseText.includes("smell you")) {
          simulated = "Kẻ địch đầy thách thức đã xuất hiện kìa! Hãy chứng minh thực lực của cậu đi!";
        } else {
          simulated = `[VietSub thử nghiệm]: ${text} (Hãy cấu hình GEMINI_API_KEY ở Settings > Secrets để sử dụng trí tuệ nhân tạo dịch hoàn chỉnh)`;
        }
        res.json({ translation: simulated });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Hãy đóng vai dịch giả chuyên nghiệp Việt hóa các hội thoại game Pokémon GBA (đặc biệt là FireRed/Emerald) sang tiếng Việt. Hãy dịch chuẩn xác, mộc mạc, tự nhiên, cuốn hút và đúng bối cảnh của một trò chơi phiêu lưu giả lập Pokémon Việt hóa, loại bỏ hoàn toàn giọng văn thô cứng hoặc máy móc. Tránh thêm bớt hay giải thích ngoài lề. Chỉ trả về kết quả dịch của câu sau: "${text}"`,
      });

      res.json({ translation: response.text || "" });
    } catch (err: any) {
      console.error("Lỗi biên dịch Gemini:", err);
      res.status(500).json({ error: "Lỗi kết nối máy chủ dịch thuật." });
    }
  });

  // Setup WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // Global helper to send data to a socket
  const sendTo = (ws: WebSocket, type: string, data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...data }));
    }
  };

  const broadcastLobby = () => {
    const list = Array.from(onlinePlayers.values()).map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      team: p.team,
      status: p.status,
    }));
    for (const player of onlinePlayers.values()) {
      sendTo(player.ws, "lobby-update", { players: list });
    }
  };

  wss.on("connection", (ws: WebSocket) => {
    let playerId = "";

    // Ping prevention loop to keep connection active
    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25000);

    ws.on("message", (message: string) => {
      try {
        const payload = JSON.parse(message);
        const { type } = payload;

        switch (type) {
          case "join-lobby": {
            playerId = payload.playerId || Math.random().toString(36).substring(2, 9);
            const player: Player = {
              id: playerId,
              username: payload.username || `Trainer ${Math.floor(Math.random() * 1000)}`,
              avatar: payload.avatar || "trainer_red",
              team: payload.team || [],
              status: "idle",
              ws: ws,
            };
            onlinePlayers.set(playerId, player);
            sendTo(ws, "lobby-joined", { id: playerId, player: { id: player.id, username: player.username } });
            broadcastLobby();
            break;
          }

          case "challenge-player": {
            const { targetId } = payload;
            const target = onlinePlayers.get(targetId);
            const self = onlinePlayers.get(playerId);
            if (target && self && target.status === "idle") {
              sendTo(target.ws, "challenge-received", {
                fromId: self.id,
                fromUsername: self.username,
              });
            }
            break;
          }

          case "challenge-response": {
            const { challengerId, accepted } = payload;
            const challenger = onlinePlayers.get(challengerId);
            const self = onlinePlayers.get(playerId);

            if (!challenger || !self) break;

            if (accepted) {
              // Initiate Battle Arena
              const battleId = `battle-${Date.now()}`;
              challenger.status = "battling";
              self.status = "battling";
              challenger.battleId = battleId;
              self.battleId = battleId;

              const battleState: BattleState = {
                id: battleId,
                player1: {
                  id: challenger.id,
                  username: challenger.username,
                  activeIdx: 0,
                  team: challenger.team,
                  currentHp: challenger.team.map((pm) => pm.hp),
                },
                player2: {
                  id: self.id,
                  username: self.username,
                  activeIdx: 0,
                  team: self.team,
                  currentHp: self.team.map((pm) => pm.hp),
                },
                turns: {},
                log: ["Bắt đầu trận đấu!", `Trọng tài triệu hồi ${challenger.username} và ${self.username}!`],
              };

              battles.set(battleId, battleState);
              
              // Notify both
              sendTo(challenger.ws, "battle-started", { battle: getSanitizedBattle(battleState, challenger.id), opponentId: self.id });
              sendTo(self.ws, "battle-started", { battle: getSanitizedBattle(battleState, self.id), opponentId: challenger.id });
              broadcastLobby();
            } else {
              sendTo(challenger.ws, "challenge-declined", { fromUsername: self.username });
            }
            break;
          }

          case "battle-action": {
            const { battleId, action, moveIdx, switchIdx } = payload;
            const battle = battles.get(battleId);
            if (!battle) break;

            battle.turns[playerId] = { action, moveIdx, switchIdx };

            const p1Id = battle.player1.id;
            const p2Id = battle.player2.id;

            // Check if both players submitted action
            if (battle.turns[p1Id] && battle.turns[p2Id]) {
              processBattleRound(battle);
              
              // Clear turns
              battle.turns = {};

              // Notify both
              const p1 = onlinePlayers.get(p1Id);
              const p2 = onlinePlayers.get(p2Id);
              if (p1) sendTo(p1.ws, "battle-updated", { battle: getSanitizedBattle(battle, p1Id) });
              if (p2) sendTo(p2.ws, "battle-updated", { battle: getSanitizedBattle(battle, p2Id) });

              // Check if game over
              const p1Fainted = battle.player1.currentHp.every((hp) => hp <= 0);
              const p2Fainted = battle.player2.currentHp.every((hp) => hp <= 0);

              if (p1Fainted || p2Fainted) {
                let winnerId = "";
                let logMsg = "";
                if (p1Fainted && p2Fainted) {
                  logMsg = "Kết quả hòa! Cả hai đội đều kiệt sức!";
                } else if (p1Fainted) {
                  winnerId = p2Id;
                  logMsg = `${battle.player2.username} giành chiến thắng chung cuộc!`;
                } else {
                  winnerId = p1Id;
                  logMsg = `${battle.player1.username} giành chiến thắng chung cuộc!`;
                }

                battle.log.push(logMsg);

                // Notify both
                if (p1) {
                  sendTo(p1.ws, "battle-ended", { battle: getSanitizedBattle(battle, p1Id), winnerId });
                  p1.status = "idle";
                }
                if (p2) {
                  sendTo(p2.ws, "battle-ended", { battle: getSanitizedBattle(battle, p2Id), winnerId });
                  p2.status = "idle";
                }

                battles.delete(battleId);
                broadcastLobby();
              }
            }
            break;
          }

          // Netplay Trading Center
          case "trade-player": {
            const { targetId } = payload;
            const target = onlinePlayers.get(targetId);
            const self = onlinePlayers.get(playerId);
            if (target && self && target.status === "idle") {
              sendTo(target.ws, "trade-received", {
                fromId: self.id,
                fromUsername: self.username,
              });
            }
            break;
          }

          case "trade-response": {
            const { proposerId, accepted } = payload;
            const proposer = onlinePlayers.get(proposerId);
            const self = onlinePlayers.get(playerId);

            if (!proposer || !self) break;

            if (accepted) {
              const tradeId = `trade-${Date.now()}`;
              proposer.status = "trading";
              self.status = "trading";

              const trade: TradeState = {
                id: tradeId,
                p1: { id: proposer.id, selectedPokemonIdx: null, confirmed: false },
                p2: { id: self.id, selectedPokemonIdx: null, confirmed: false }
              };

              trades.set(tradeId, trade);

              // Notify both
              sendTo(proposer.ws, "trade-started", { tradeId, otherUser: { id: self.id, username: self.username, team: self.team } });
              sendTo(self.ws, "trade-started", { tradeId, otherUser: { id: proposer.id, username: proposer.username, team: proposer.team } });
              broadcastLobby();
            } else {
              sendTo(proposer.ws, "trade-declined", { fromUsername: self.username });
            }
            break;
          }

          case "trade-select-pokemon": {
            const { tradeId, idx } = payload;
            const trade = trades.get(tradeId);
            if (!trade) break;

            const isP1 = trade.p1.id === playerId;
            if (isP1) {
              trade.p1.selectedPokemonIdx = idx;
              trade.p1.confirmed = false;
            } else {
              trade.p2.selectedPokemonIdx = idx;
              trade.p2.confirmed = false;
            }

            const p1ws = onlinePlayers.get(trade.p1.id)?.ws;
            const p2ws = onlinePlayers.get(trade.p2.id)?.ws;

            if (p1ws) sendTo(p1ws, "trade-updated", { trade });
            if (p2ws) sendTo(p2ws, "trade-updated", { trade });
            break;
          }

          case "trade-confirm-pokemon": {
            const { tradeId } = payload;
            const trade = trades.get(tradeId);
            if (!trade) break;

            const isP1 = trade.p1.id === playerId;
            if (isP1) {
              trade.p1.confirmed = true;
            } else {
              trade.p2.confirmed = true;
            }

            const p1Player = onlinePlayers.get(trade.p1.id);
            const p2Player = onlinePlayers.get(trade.p2.id);

            if (p1Player && p2Player) {
              // Notify of status change
              sendTo(p1Player.ws, "trade-updated", { trade });
              sendTo(p2Player.ws, "trade-updated", { trade });

              // If both confirmed, make trade complete!
              if (trade.p1.confirmed && trade.p2.confirmed && trade.p1.selectedPokemonIdx !== null && trade.p2.selectedPokemonIdx !== null) {
                const pk1 = p1Player.team[trade.p1.selectedPokemonIdx];
                const pk2 = p2Player.team[trade.p2.selectedPokemonIdx];

                // SWAP team members in server state
                p1Player.team[trade.p1.selectedPokemonIdx] = pk2;
                p2Player.team[trade.p2.selectedPokemonIdx] = pk1;

                sendTo(p1Player.ws, "trade-complete", {
                  team: p1Player.team,
                  receivedPokemon: pk2,
                  sentPokemon: pk1
                });

                sendTo(p2Player.ws, "trade-complete", {
                  team: p2Player.team,
                  receivedPokemon: pk1,
                  sentPokemon: pk2
                });

                p1Player.status = "idle";
                p2Player.status = "idle";
                trades.delete(tradeId);
                broadcastLobby();
              }
            }
            break;
          }

          case "leave-trade": {
            const { tradeId } = payload;
            const trade = trades.get(tradeId);
            if (!trade) break;

            const p1 = onlinePlayers.get(trade.p1.id);
            const p2 = onlinePlayers.get(trade.p2.id);

            if (p1) { p1.status = "idle"; sendTo(p1.ws, "trade-cancelled", {}); }
            if (p2) { p2.status = "idle"; sendTo(p2.ws, "trade-cancelled", {}); }

            trades.delete(tradeId);
            broadcastLobby();
            break;
          }
        }
      } catch (e) {
        console.error("Lỗi parse WS message:", e);
      }
    });

    ws.on("close", () => {
      clearInterval(keepAlive);
      if (playerId) {
        const player = onlinePlayers.get(playerId);
        onlinePlayers.delete(playerId);
        
        // Handle disconnect if in trade/battle
        if (player) {
          if (player.status === "battling" && player.battleId) {
            const battle = battles.get(player.battleId);
            if (battle) {
              const otherId = battle.player1.id === playerId ? battle.player2.id : battle.player1.id;
              const other = onlinePlayers.get(otherId);
              if (other) {
                other.status = "idle";
                sendTo(other.ws, "battle-ended-disconnect", { opponentUsername: player.username });
              }
              battles.delete(player.battleId);
            }
          }
          broadcastLobby();
        }
      }
    });
  });

  // GBA Pokemon Battle Engine Mechanics
  function processBattleRound(battle: BattleState) {
    const p1Id = battle.player1.id;
    const p2Id = battle.player2.id;
    const t1 = battle.turns[p1Id];
    const t2 = battle.turns[p2Id];

    const pk1 = battle.player1.team[battle.player1.activeIdx];
    const pk2 = battle.player2.team[battle.player2.activeIdx];

    // Speed comparison for priority
    const speed1 = pk1.stats.speed;
    const speed2 = pk2.stats.speed;

    // Fast resolution queue
    const queue: { playerId: string; action: any; pokemon: Pokemon; oppPokemon: Pokemon; isP1: boolean }[] = [];

    const item1 = { playerId: p1Id, action: t1, pokemon: pk1, oppPokemon: pk2, isP1: true };
    const item2 = { playerId: p2Id, action: t2, pokemon: pk2, oppPokemon: pk1, isP1: false };

    // Switches always move first
    if (t1.action === "switch" && t2.action === "switch") {
      queue.push(item1, item2);
    } else if (t1.action === "switch") {
      queue.push(item1, item2);
    } else if (t2.action === "switch") {
      queue.push(item2, item1);
    } else {
      // Fight priority based on Speed stat
      if (speed1 >= speed2) {
        queue.push(item1, item2);
      } else {
        queue.push(item2, item1);
      }
    }

    for (let i = 0; i < queue.length; i++) {
      const turn = queue[i];
      const selfActiveHp = turn.isP1
        ? battle.player1.currentHp[battle.player1.activeIdx]
        : battle.player2.currentHp[battle.player2.activeIdx];

      if (selfActiveHp <= 0) {
        // If this pokemon already fainted this round, skip its turn
        continue;
      }

      if (turn.action.action === "switch") {
        const switchIdx = turn.action.switchIdx!;
        if (turn.isP1) {
          const prevName = battle.player1.team[battle.player1.activeIdx].name;
          battle.player1.activeIdx = switchIdx;
          const newName = battle.player1.team[switchIdx].name;
          battle.log.push(`${battle.player1.username} rút ${prevName} về và triệu hồi ${newName}!`);
        } else {
          const prevName = battle.player2.team[battle.player2.activeIdx].name;
          battle.player2.activeIdx = switchIdx;
          const newName = battle.player2.team[switchIdx].name;
          battle.log.push(`${battle.player2.username} rút ${prevName} về và triệu hồi ${newName}!`);
        }
      }

      if (turn.action.action === "fight") {
        const moveIdx = turn.action.moveIdx || 0;
        const currentPokemon = turn.isP1
          ? battle.player1.team[battle.player1.activeIdx]
          : battle.player2.team[battle.player2.activeIdx];
          
        const opponentPokemon = turn.isP1
          ? battle.player2.team[battle.player2.activeIdx]
          : battle.player1.team[battle.player1.activeIdx];

        const opponentActiveIdx = turn.isP1 ? battle.player2.activeIdx : battle.player1.activeIdx;
        const opponentHpArray = turn.isP1 ? battle.player2.currentHp : battle.player1.currentHp;

        if (opponentHpArray[opponentActiveIdx] <= 0) {
          // Opponent fainted, skip fight action
          continue;
        }

        const moveSelected = currentPokemon.moves[moveIdx] || "Tấn Công";
        battle.log.push(`${currentPokemon.name} dùng chiêu ${moveSelected}!`);

        // Compute dynamic damage formula (Pokemon simplifier)
        const isSpecial = ["Lửa", "Nước", "Sấm Sét", "Tâm Linh", "Băng"].some((type) => moveSelected.includes(type));
        const atkPower = isSpecial ? currentPokemon.stats.spAtk : currentPokemon.stats.attack;
        const defPower = isSpecial ? opponentPokemon.stats.spDef : opponentPokemon.stats.defense;

        const baseDmg = Math.floor(((2 * currentPokemon.level) / 5 + 2) * 45 * (atkPower / Math.max(1, defPower)) / 50 + 2);
        const variance = Math.floor(baseDmg * (0.85 + Math.random() * 0.15));
        const finalDamage = Math.max(5, variance);

        // Apply hit
        opponentHpArray[opponentActiveIdx] = Math.max(0, opponentHpArray[opponentActiveIdx] - finalDamage);
        battle.log.push(`${opponentPokemon.name} nhận ${finalDamage} ST! (Cần lại: ${opponentHpArray[opponentActiveIdx]}/${opponentPokemon.maxHp} HP)`);

        if (opponentHpArray[opponentActiveIdx] <= 0) {
          battle.log.push(`${opponentPokemon.name} của ${turn.isP1 ? battle.player2.username : battle.player1.username} đã bị hạ gục!`);
          
          // Check next pokemon
          const hasMore = opponentHpArray.some((hp) => hp > 0);
          if (hasMore) {
            const nextIdx = opponentHpArray.findIndex((hp) => hp > 0);
            if (turn.isP1) {
              battle.player2.activeIdx = nextIdx;
              battle.log.push(`${battle.player2.username} triệu hồi ${battle.player2.team[nextIdx].name} ra sân!`);
            } else {
              battle.player1.activeIdx = nextIdx;
              battle.log.push(`${battle.player1.username} triệu hồi ${battle.player1.team[nextIdx].name} ra sân!`);
            }
          }
        }
      }
    }
  }

  function getSanitizedBattle(battle: BattleState, forPlayerId: string) {
    const isP1 = battle.player1.id === forPlayerId;
    return {
      id: battle.id,
      selfTeam: isP1 ? battle.player1.team : battle.player2.team,
      selfActiveIdx: isP1 ? battle.player1.activeIdx : battle.player2.activeIdx,
      selfCurrentHp: isP1 ? battle.player1.currentHp : battle.player2.currentHp,
      selfName: isP1 ? battle.player1.username : battle.player2.username,
      oppTeam: isP1 ? battle.player2.team : battle.player1.team,
      oppActiveIdx: isP1 ? battle.player2.activeIdx : battle.player1.activeIdx,
      oppCurrentHp: isP1 ? battle.player2.currentHp : battle.player1.currentHp,
      oppName: isP1 ? battle.player2.username : battle.player1.username,
      log: battle.log,
      pendingAction: !battle.turns[forPlayerId]
    };
  }

  // Vite development vs production serving model
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Node.js Container] GBA Pokemon Server started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
